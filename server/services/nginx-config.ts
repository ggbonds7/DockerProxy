export type ParsedNginxRouteCandidate = {
  confPath: string;
  domain: string;
  target: string;
  ssl: boolean;
};

export type ParsedNginxConfigIssue = {
  confPath: string;
  reason: string;
  domain?: string;
  target?: string;
  ssl?: boolean;
};

function normalizeProxyPassTarget(rawTarget: string) {
  const value = String(rawTarget || "").trim().replace(/;$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    return value.replace(/\/$/, "");
  }
  return value;
}

function stripQuotedValue(value: string) {
  const trimmed = String(value || "").trim();
  const matched = trimmed.match(/^(['"])([\s\S]*)\1$/);
  return matched ? matched[2] : trimmed;
}

function extractServerBlocks(content: string) {
  const blocks: string[] = [];
  const text = String(content || "");
  const pattern = /\bserver\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    const braceStart = text.indexOf("{", match.index);
    if (braceStart < 0) continue;
    let depth = 1;
    let index = braceStart + 1;

    while (index < text.length && depth > 0) {
      const char = text[index];
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      index += 1;
    }

    if (depth === 0) {
      blocks.push(text.slice(match.index, index));
      pattern.lastIndex = index;
    }
  }

  return blocks;
}

function extractServerNames(block: string) {
  const match = block.match(/^\s*server_name\s+([^;]+);/m);
  if (!match) return [];
  return match[1]
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item !== "_");
}

function extractProxyTargets(block: string) {
  const variables = new Map<string, string>();
  for (const match of block.matchAll(/^\s*set\s+\$([A-Za-z0-9_]+)\s+([^;]+);/gm)) {
    variables.set(match[1], stripQuotedValue(match[2]));
  }

  return Array.from(block.matchAll(/^\s*proxy_pass\s+([^;]+);/gm))
    .map((match) => {
      let value = String(match[1] || "").trim();
      value = value.replace(/\$([A-Za-z0-9_]+)/g, (_, variableName: string) => variables.get(variableName) || `$${variableName}`);
      return normalizeProxyPassTarget(value);
    })
    .filter(Boolean);
}

function blockHasSsl(block: string) {
  return /\blisten\s+[^;]*443\b/.test(block) || /\bssl_certificate\b/.test(block) || /\blisten\s+[^;]*\bssl\b/.test(block);
}

export function parseNginxConfigFile(confPath: string, content: string) {
  const blocks = extractServerBlocks(content);
  const routes: ParsedNginxRouteCandidate[] = [];
  const unmanaged: ParsedNginxConfigIssue[] = [];

  if (!blocks.length) {
    return {
      routes,
      unmanaged: [{ confPath, reason: "未找到可解析的 server 块。" }],
    };
  }

  const byDomain = new Map<string, { targets: Set<string>; ssl: boolean }>();

  for (const block of blocks) {
    if (/^\s*(upstream|map)\s+/m.test(block) || /^\s*include\s+/m.test(block)) {
      unmanaged.push({ confPath, reason: "包含高级 Nginx 指令，平台不会自动导入。" });
      continue;
    }

    const serverNames = extractServerNames(block);
    const proxyTargets = extractProxyTargets(block);
    const ssl = blockHasSsl(block);

    if (!serverNames.length) {
      unmanaged.push({ confPath, reason: "未找到 server_name，无法识别路由域名。", ssl });
      continue;
    }

    if (proxyTargets.length === 0) {
      continue;
    }

    const uniqueTargets = Array.from(new Set(proxyTargets));
    if (uniqueTargets.length !== 1) {
      unmanaged.push({
        confPath,
        domain: serverNames.join(", "),
        ssl,
        reason: "同一 server 块内存在多个 proxy_pass，平台不会自动导入。",
      });
      continue;
    }

    if (uniqueTargets[0].includes("$")) {
      unmanaged.push({
        confPath,
        domain: serverNames.join(", "),
        ssl,
        target: uniqueTargets[0],
        reason: "proxy_pass 目标仍包含未解析变量，平台不会自动导入。",
      });
      continue;
    }

    for (const domain of serverNames) {
      const current = byDomain.get(domain) || { targets: new Set<string>(), ssl: false };
      current.targets.add(uniqueTargets[0]);
      current.ssl = current.ssl || ssl;
      byDomain.set(domain, current);
    }
  }

  for (const [domain, current] of byDomain.entries()) {
    const targets = Array.from(current.targets);
    if (targets.length !== 1) {
      unmanaged.push({
        confPath,
        domain,
        ssl: current.ssl,
        reason: "同一域名在配置中对应多个 proxy_pass，平台不会自动导入。",
      });
      continue;
    }

    routes.push({
      confPath,
      domain,
      target: targets[0],
      ssl: current.ssl,
    });
  }

  if (!routes.length && !unmanaged.length) {
    unmanaged.push({ confPath, reason: "未找到可导入的反向代理配置。" });
  }

  return { routes, unmanaged };
}

export function renderManagedNginxConfig(route: { domain: string; target?: string; targetIp?: string; targetPort?: string | number; ssl?: boolean }) {
  const target = route.target
    ? String(route.target).trim()
    : route.targetIp && route.targetPort
      ? `${String(route.targetIp).trim()}:${String(route.targetPort).trim()}`
      : "";
  const upstream = /^https?:\/\//.test(target) ? target : `http://${target}`;

  if (route.ssl) {
    return `server {
    listen 80;
    server_name ${route.domain};

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name ${route.domain};

    ssl_certificate /etc/nginx/certs/${route.domain}/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/${route.domain}/privkey.pem;

    location / {
        proxy_pass ${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
  }

  return `server {
    listen 80;
    server_name ${route.domain};

    location / {
        proxy_pass ${upstream};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
}
