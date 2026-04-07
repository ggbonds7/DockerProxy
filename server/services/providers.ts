import crypto from "crypto";
import axios from "axios";
import { getDb } from "../db";
import { decryptSecret, encryptSecret, hasMasterKey } from "./security";

type ProviderKey = "cloudflare" | "gcore";

type IntegrationRow = {
  id: string;
  kind: string;
  provider: ProviderKey;
  display_name: string;
  status: string;
  metadata_json: string;
  last_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

type SecretRow = {
  integration_id: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
  key_version: number;
  created_at: string;
  updated_at: string;
};

type ProviderConnectionSettings = {
  managedZones: string[];
  defaultTtl: number | null;
  defaultProxied: boolean | null;
};

type ProviderConnectionMetadata = {
  managedBy: "database";
  zoneCount?: number | null;
  lastError?: string | null;
  settings: ProviderConnectionSettings;
};

type CreateProviderConnectionInput = {
  provider: ProviderKey;
  displayName?: string;
  apiToken?: string;
  apiKey?: string;
  managedZones?: string[];
  defaultTtl?: number | null;
  defaultProxied?: boolean | null;
};

type UpdateProviderConnectionInput = {
  displayName?: string;
  managedZones?: string[];
  defaultTtl?: number | null;
  defaultProxied?: boolean | null;
};

type ProviderSecretPayload = {
  apiToken?: string;
  apiKey?: string;
};

type ZoneSummary = {
  id: string;
  name: string;
  status?: string;
  provider: ProviderKey;
  rrsetsAmount?: number | null;
};

type NormalizedRecord = {
  id: string;
  provider: ProviderKey;
  name: string;
  fqdn: string;
  type: string;
  content: string;
  ttl: number;
  proxied?: boolean;
  editable: boolean;
  deletable?: boolean;
  readOnlyReason?: string;
  meta?: Record<string, unknown>;
};

type SerializedConnection = {
  id: string;
  kind: string;
  provider: ProviderKey;
  displayName: string;
  status: string;
  managedBy: "database";
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  zoneCount: number | null;
  lastError: string | null;
  settings: ProviderConnectionSettings;
  capabilities: {
    supportsProxyStatus: boolean;
    recordTypes: string[];
  };
};

const RECORD_TYPES: Record<ProviderKey, string[]> = {
  cloudflare: ["A", "AAAA", "CNAME", "TXT"],
  gcore: ["A", "AAAA", "CNAME", "TXT"],
};

function nowIso() {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeManagedZones(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeOptionalNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("默认 TTL 必须是大于 0 的数字");
  }
  return parsed;
}

function normalizeOptionalBoolean(value: unknown) {
  if (value == null || value === "") return null;
  return Boolean(value);
}

function normalizeSettings(input: Partial<ProviderConnectionSettings>, provider: ProviderKey): ProviderConnectionSettings {
  return {
    managedZones: normalizeManagedZones(input.managedZones),
    defaultTtl: normalizeOptionalNumber(input.defaultTtl),
    defaultProxied: provider === "cloudflare" ? normalizeOptionalBoolean(input.defaultProxied) : null,
  };
}

function defaultMetadata(provider: ProviderKey, settings: Partial<ProviderConnectionSettings> = {}): ProviderConnectionMetadata {
  return {
    managedBy: "database",
    zoneCount: null,
    lastError: null,
    settings: normalizeSettings(settings, provider),
  };
}

function getIntegrationRows() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM integrations WHERE kind = 'dns-provider' ORDER BY created_at ASC")
    .all() as IntegrationRow[];
}

function getIntegrationRow(connectionId: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM integrations WHERE id = ? AND kind = 'dns-provider'").get(connectionId) as IntegrationRow | undefined;
}

function getSecretRow(connectionId: string) {
  const db = getDb();
  return db.prepare("SELECT * FROM integration_secrets WHERE integration_id = ?").get(connectionId) as SecretRow | undefined;
}

function readMetadata(row: IntegrationRow) {
  const parsed = parseJson<Partial<ProviderConnectionMetadata>>(row.metadata_json, {});
  return {
    managedBy: "database" as const,
    zoneCount: typeof parsed.zoneCount === "number" ? parsed.zoneCount : null,
    lastError: typeof parsed.lastError === "string" ? parsed.lastError : null,
    settings: normalizeSettings(parsed.settings || {}, row.provider),
  } satisfies ProviderConnectionMetadata;
}

function writeMetadata(row: IntegrationRow, patch: Partial<ProviderConnectionMetadata>) {
  const current = readMetadata(row);
  const next: ProviderConnectionMetadata = {
    ...current,
    ...patch,
    settings: normalizeSettings(
      {
        ...current.settings,
        ...(patch.settings || {}),
      },
      row.provider,
    ),
  };
  return JSON.stringify(next);
}

function serializeConnection(row: IntegrationRow): SerializedConnection {
  const metadata = readMetadata(row);
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    displayName: row.display_name,
    status: row.status,
    managedBy: metadata.managedBy,
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    zoneCount: metadata.zoneCount ?? null,
    lastError: metadata.lastError ?? null,
    settings: metadata.settings,
    capabilities: {
      supportsProxyStatus: row.provider === "cloudflare",
      recordTypes: RECORD_TYPES[row.provider],
    },
  };
}

function getCloudflareClient(token: string) {
  return axios.create({
    baseURL: "https://api.cloudflare.com/client/v4",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

function getGcoreClient(apiKey: string) {
  return axios.create({
    baseURL: "https://api.gcore.com/dns",
    headers: {
      Authorization: `apikey ${apiKey}`,
      "Content-Type": "application/json",
    },
  });
}

function normalizeZoneName(zoneName: string, fqdn: string) {
  if (fqdn === zoneName) return "@";
  return fqdn.endsWith(`.${zoneName}`) ? fqdn.slice(0, -1 * (`.${zoneName}`.length)) : fqdn;
}

function normalizeProviderZoneName(zoneName: string) {
  return String(zoneName || "").trim().replace(/\.+$/, "");
}

function isGcoreProtectedRecord(zoneName: string, rrsetName: string, rrsetType: string) {
  const normalizedName = normalizeZoneName(zoneName, rrsetName);
  return rrsetType === "SOA" || (rrsetType === "NS" && normalizedName === "@");
}

function toContentString(content: unknown) {
  if (Array.isArray(content)) {
    return content.map((item) => String(item)).join(" ");
  }
  if (content == null) return "";
  return String(content);
}

async function resolveCloudflareZoneId(token: string, zoneName: string) {
  const client = getCloudflareClient(token);
  const response = await client.get("/zones", { params: { name: zoneName } });
  const zone = response.data?.result?.[0];
  if (!zone?.id) {
    throw new Error(`Cloudflare 未找到 Zone: ${zoneName}`);
  }
  return zone.id as string;
}

async function cloudflareListZones(token: string): Promise<ZoneSummary[]> {
  const client = getCloudflareClient(token);
  const response = await client.get("/zones");
  return (response.data?.result || []).map((zone: any) => ({
    id: zone.id,
    name: zone.name,
    status: zone.status,
    provider: "cloudflare" as const,
  }));
}

async function cloudflareListRecords(token: string, zoneName: string): Promise<NormalizedRecord[]> {
  const client = getCloudflareClient(token);
  const zoneId = await resolveCloudflareZoneId(token, zoneName);
  const response = await client.get(`/zones/${zoneId}/dns_records`);
  return (response.data?.result || []).map((record: any) => ({
    id: record.id,
    provider: "cloudflare",
    name: normalizeZoneName(zoneName, record.name),
    fqdn: record.name,
    type: record.type,
    content: record.content,
    ttl: record.ttl,
    proxied: record.proxied,
    editable: true,
    deletable: true,
    meta: {
      providerId: record.id,
    },
  }));
}

async function cloudflareCreateRecord(token: string, zoneName: string, payload: Record<string, unknown>) {
  const client = getCloudflareClient(token);
  const zoneId = await resolveCloudflareZoneId(token, zoneName);
  const response = await client.post(`/zones/${zoneId}/dns_records`, payload);
  return response.data?.result;
}

async function cloudflareUpdateRecord(token: string, zoneName: string, recordId: string, payload: Record<string, unknown>) {
  const client = getCloudflareClient(token);
  const zoneId = await resolveCloudflareZoneId(token, zoneName);
  const response = await client.put(`/zones/${zoneId}/dns_records/${recordId}`, payload);
  return response.data?.result;
}

async function cloudflareDeleteRecord(token: string, zoneName: string, recordId: string) {
  const client = getCloudflareClient(token);
  const zoneId = await resolveCloudflareZoneId(token, zoneName);
  const response = await client.delete(`/zones/${zoneId}/dns_records/${recordId}`);
  return response.data?.result;
}

async function gcoreListZones(apiKey: string): Promise<ZoneSummary[]> {
  const client = getGcoreClient(apiKey);
  const response = await client.get("/v2/zones");
  return (response.data?.zones || []).map((zone: any) => ({
    id: String(zone.id || zone.name),
    name: zone.name,
    status: zone.status || (zone.enabled ? "active" : "disabled"),
    provider: "gcore" as const,
    rrsetsAmount: zone.rrsets_amount || null,
  }));
}

async function resolveGcoreZoneName(apiKey: string, zoneName: string) {
  const normalizedZone = normalizeProviderZoneName(zoneName);
  const zones = await gcoreListZones(apiKey);
  const matchedZone = zones.find((zone) => normalizeProviderZoneName(zone.name).toLowerCase() === normalizedZone.toLowerCase());
  if (matchedZone?.name) {
    return matchedZone.name;
  }
  throw new Error(`Gcore zone not found for this connection: ${zoneName}`);
}

async function gcoreFetchAllRrsets(client: ReturnType<typeof getGcoreClient>, resolvedZone: string) {
  const limit = 100;
  let offset = 0;
  let totalAmount: number | null = null;
  const rrsets: any[] = [];

  while (true) {
    const response = await client.get(`/v2/zones/${encodeURIComponent(resolvedZone)}/rrsets`, {
      params: {
        offset,
        limit,
        order_by: 'name',
        order_direction: 'asc',
      },
    });

    const pageItems = Array.isArray(response.data?.rrsets)
      ? response.data.rrsets
      : Array.isArray(response.data)
        ? response.data
        : [];

    rrsets.push(...pageItems);

    const parsedTotal = Number(response.data?.total_amount);
    totalAmount = Number.isFinite(parsedTotal) ? parsedTotal : totalAmount;

    if (pageItems.length === 0) {
      break;
    }
    if (totalAmount != null && rrsets.length >= totalAmount) {
      break;
    }
    if (pageItems.length < limit) {
      break;
    }

    offset += pageItems.length;
  }

  return rrsets;
}

async function gcoreListRecords(apiKey: string, zoneName: string): Promise<NormalizedRecord[]> {
  const client = getGcoreClient(apiKey);
  const resolvedZone = await resolveGcoreZoneName(apiKey, zoneName);
  const rrsets = await gcoreFetchAllRrsets(client, resolvedZone);
  return rrsets.map((rrset: any) => {
    const resourceRecords = Array.isArray(rrset.resource_records) ? rrset.resource_records : [];
    const simpleRecord = resourceRecords.length === 1 && !rrset.pickers?.length && !(rrset.warnings || []).length;
    const primaryRecord = resourceRecords[0];
    const deletable = !isGcoreProtectedRecord(resolvedZone, rrset.name, rrset.type);
    const readOnlyReason = simpleRecord
      ? undefined
      : rrset.pickers?.length
        ? "该 RRset 带有高级路由配置，暂不支持直接编辑"
        : resourceRecords.length > 1
          ? "该 RRset 包含多个资源记录，暂不支持直接编辑"
          : (rrset.warnings || []).map((item: any) => item.message).filter(Boolean).join("；") || rrset.warning || "该 RRset 暂不支持编辑";

    return {
      id: `${rrset.name}::${rrset.type}`,
      provider: "gcore",
      name: normalizeZoneName(resolvedZone, rrset.name),
      fqdn: rrset.name,
      type: rrset.type,
      content: toContentString(primaryRecord?.content),
      ttl: rrset.ttl || 0,
      editable: Boolean(simpleRecord),
      deletable,
      readOnlyReason,
      meta: {
        providerId: `${rrset.name}::${rrset.type}`,
        warnings: rrset.warnings || [],
      },
    };
  });
}

async function gcoreCreateOrUpdateRecord(
  apiKey: string,
  zoneName: string,
  payload: Record<string, unknown>,
  method: "post" | "put",
) {
  const client = getGcoreClient(apiKey);
  const resolvedZone = await resolveGcoreZoneName(apiKey, zoneName);
  const rrsetName = payload.name === "@" ? resolvedZone : String(payload.fqdn || payload.name || "").trim() || resolvedZone;
  const rrsetType = String(payload.type || "A");
  const response = await client.request({
    url: `/v2/zones/${encodeURIComponent(resolvedZone)}/${encodeURIComponent(rrsetName)}/${encodeURIComponent(rrsetType)}`,
    method,
    data: {
      ttl: Number(payload.ttl || 300),
      resource_records: [
        {
          content: [String(payload.content || "")],
          enabled: true,
        },
      ],
    },
  });
  return response.data;
}

async function gcoreDeleteRecord(apiKey: string, zoneName: string, recordId: string) {
  const client = getGcoreClient(apiKey);
  const resolvedZone = await resolveGcoreZoneName(apiKey, zoneName);
  const [rrsetName, ...typeParts] = recordId.split("::");
  const rrsetType = typeParts.join("::");
  if (!rrsetName || !rrsetType) {
    throw new Error("Invalid Gcore record id.");
  }
  if (isGcoreProtectedRecord(resolvedZone, rrsetName, rrsetType)) {
    throw new Error("Protected Gcore records cannot be deleted.");
  }

  const primaryPath = `/v2/zones/${encodeURIComponent(resolvedZone)}/${encodeURIComponent(rrsetName)}/${encodeURIComponent(rrsetType)}`;
  const fallbackPath = `/v2/zones/${encodeURIComponent(resolvedZone)}/rrsets/${encodeURIComponent(rrsetName)}/${encodeURIComponent(rrsetType)}`;

  try {
    const response = await client.delete(primaryPath);
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error) || (error.response?.status !== 404 && error.response?.status !== 405)) {
      throw error;
    }

    const response = await client.delete(fallbackPath);
    return response.data;
  }
}

function buildPayload(input: any, zoneName: string, provider: ProviderKey, defaults: ProviderConnectionSettings) {
  const name = String(input.name || "@").trim() || "@";
  const fqdn = name === "@" ? zoneName : name.endsWith(`.${zoneName}`) ? name : `${name}.${zoneName}`;
  const ttl = input.ttl == null || input.ttl === "" ? defaults.defaultTtl || 1 : Number(input.ttl);
  const proxied = input.proxied == null ? defaults.defaultProxied ?? false : Boolean(input.proxied);

  return {
    name,
    fqdn,
    type: String(input.type || "A").toUpperCase(),
    content: String(input.content || "").trim(),
    ttl,
    proxied,
    provider,
  };
}

function assertProvider(provider: unknown): asserts provider is ProviderKey {
  if (provider !== "cloudflare" && provider !== "gcore") {
    throw new Error("暂不支持该 DNS 平台");
  }
}

function decodeSecret(row: IntegrationRow) {
  const secretRow = getSecretRow(row.id);
  if (!secretRow) {
    throw new Error("平台接入密钥不存在");
  }

  const decrypted = parseJson<ProviderSecretPayload>(
    decryptSecret({
      ciphertext: secretRow.ciphertext,
      iv: secretRow.iv,
      authTag: secretRow.auth_tag,
      keyVersion: secretRow.key_version,
    }),
    {},
  );

  const secret = row.provider === "cloudflare" ? decrypted.apiToken : decrypted.apiKey;
  if (!secret) {
    throw new Error("平台接入密钥无效");
  }

  return secret;
}

function getConnectionRowOrThrow(connectionId: string) {
  const row = getIntegrationRow(connectionId);
  if (!row) {
    throw new Error("平台接入不存在");
  }
  return row;
}

async function fetchZonesForConnection(row: IntegrationRow, secret: string) {
  return row.provider === "cloudflare" ? cloudflareListZones(secret) : gcoreListZones(secret);
}

function filterZonesBySettings(zones: ZoneSummary[], settings: ProviderConnectionSettings) {
  if (!settings.managedZones.length) return zones;
  const allowed = new Set(settings.managedZones);
  return zones.filter((zone) => allowed.has(zone.name));
}

async function getConnectionAccess(connectionId: string) {
  const row = getConnectionRowOrThrow(connectionId);
  const secret = decodeSecret(row);
  const metadata = readMetadata(row);
  return { row, secret, metadata };
}

async function assertZoneAllowed(connectionId: string, zoneName: string) {
  const access = await getConnectionAccess(connectionId);
  if (access.metadata.settings.managedZones.length && !access.metadata.settings.managedZones.includes(zoneName)) {
    throw new Error(`Zone ${zoneName} 不在当前接入的管理范围内`);
  }
  return access;
}

export function getProviderCatalog() {
  return [
    {
      key: "cloudflare",
      name: "Cloudflare",
      supportsProxyStatus: true,
      authFields: [
        {
          key: "apiToken",
          label: "API Token",
          placeholder: "请输入具有 Zone 读取与 DNS 编辑权限的 Token",
          secret: true,
        },
      ],
      description: "适合管理 Cloudflare Zone 与 DNS 记录，支持代理状态与常见记录类型。",
    },
    {
      key: "gcore",
      name: "Gcore",
      supportsProxyStatus: false,
      authFields: [
        {
          key: "apiKey",
          label: "API Key",
          placeholder: "请输入 Gcore Managed DNS API Key",
          secret: true,
        },
      ],
      description: "适合接入 Gcore Managed DNS，支持 Zone 查询与常见记录管理。",
    },
  ];
}

export function listProviderConnections() {
  return getIntegrationRows().map(serializeConnection);
}

export async function createProviderConnection(input: CreateProviderConnectionInput) {
  if (!hasMasterKey()) {
    throw new Error("创建平台接入前请先配置 APP_MASTER_KEY");
  }

  assertProvider(input.provider);
  const secret = input.provider === "cloudflare" ? input.apiToken?.trim() : input.apiKey?.trim();
  if (!secret) {
    throw new Error(input.provider === "cloudflare" ? "请填写 Cloudflare API Token" : "请填写 Gcore API Key");
  }

  const db = getDb();
  const id = crypto.randomUUID();
  const timestamp = nowIso();
  const metadata = defaultMetadata(input.provider, {
    managedZones: input.managedZones,
    defaultTtl: input.defaultTtl,
    defaultProxied: input.defaultProxied,
  });
  const encrypted = encryptSecret(JSON.stringify(input.provider === "cloudflare" ? { apiToken: secret } : { apiKey: secret }));

  db.prepare(
    `INSERT INTO integrations (id, kind, provider, display_name, status, metadata_json, last_verified_at, created_at, updated_at)
     VALUES (@id, 'dns-provider', @provider, @displayName, 'pending', @metadataJson, NULL, @createdAt, @updatedAt)`,
  ).run({
    id,
    provider: input.provider,
    displayName: input.displayName?.trim() || `${input.provider}-${timestamp.slice(0, 10)}`,
    metadataJson: JSON.stringify(metadata),
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  db.prepare(
    `INSERT INTO integration_secrets (integration_id, ciphertext, iv, auth_tag, key_version, created_at, updated_at)
     VALUES (@integrationId, @ciphertext, @iv, @authTag, @keyVersion, @createdAt, @updatedAt)`,
  ).run({
    integrationId: id,
    ciphertext: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    keyVersion: encrypted.keyVersion,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  await verifyProviderConnection(id);
  return listProviderConnections().find((connection) => connection.id === id) || null;
}

export async function updateProviderConnectionSettings(connectionId: string, input: UpdateProviderConnectionInput) {
  const row = getConnectionRowOrThrow(connectionId);
  const db = getDb();
  const timestamp = nowIso();
  const metadataJson = writeMetadata(row, {
    settings: {
      managedZones: input.managedZones,
      defaultTtl: input.defaultTtl,
      defaultProxied: input.defaultProxied,
    },
  });

  db.prepare(
    `UPDATE integrations
     SET display_name = @displayName,
         metadata_json = @metadataJson,
         updated_at = @updatedAt
     WHERE id = @id`,
  ).run({
    id: connectionId,
    displayName: input.displayName?.trim() || row.display_name,
    metadataJson,
    updatedAt: timestamp,
  });

  return listProviderConnections().find((connection) => connection.id === connectionId) || null;
}

export async function verifyProviderConnection(connectionId: string) {
  const row = getConnectionRowOrThrow(connectionId);
  const db = getDb();
  const timestamp = nowIso();

  try {
    const secret = decodeSecret(row);
    const zones = await fetchZonesForConnection(row, secret);
    const metadataJson = writeMetadata(row, {
      zoneCount: zones.length,
      lastError: null,
    });

    db.prepare(
      `UPDATE integrations
       SET status = 'ready',
           metadata_json = @metadataJson,
           last_verified_at = @lastVerifiedAt,
           updated_at = @updatedAt
       WHERE id = @id`,
    ).run({
      id: connectionId,
      metadataJson,
      lastVerifiedAt: timestamp,
      updatedAt: timestamp,
    });
  } catch (error: any) {
    const metadataJson = writeMetadata(row, {
      lastError: error.message || "连接验证失败",
    });

    db.prepare(
      `UPDATE integrations
       SET status = 'error',
           metadata_json = @metadataJson,
           last_verified_at = @lastVerifiedAt,
           updated_at = @updatedAt
       WHERE id = @id`,
    ).run({
      id: connectionId,
      metadataJson,
      lastVerifiedAt: timestamp,
      updatedAt: timestamp,
    });

    throw error;
  }

  return listProviderConnections().find((connection) => connection.id === connectionId) || null;
}

export async function listConnectionZones(connectionId: string, options: { includeAll?: boolean } = {}) {
  const { row, secret, metadata } = await getConnectionAccess(connectionId);
  const zones = await fetchZonesForConnection(row, secret);
  return options.includeAll ? zones : filterZonesBySettings(zones, metadata.settings);
}

export async function listConnectionRecords(connectionId: string, zoneName: string) {
  const { row, secret } = await assertZoneAllowed(connectionId, zoneName);
  return row.provider === "cloudflare"
    ? cloudflareListRecords(secret, zoneName)
    : gcoreListRecords(secret, zoneName);
}

export async function createConnectionRecord(connectionId: string, zoneName: string, input: any) {
  const { row, secret, metadata } = await assertZoneAllowed(connectionId, zoneName);
  const payload = buildPayload(input, zoneName, row.provider, metadata.settings);
  return row.provider === "cloudflare"
    ? cloudflareCreateRecord(secret, zoneName, payload)
    : gcoreCreateOrUpdateRecord(secret, zoneName, payload, "post");
}

export async function updateConnectionRecord(connectionId: string, zoneName: string, recordId: string, input: any) {
  const { row, secret, metadata } = await assertZoneAllowed(connectionId, zoneName);
  const payload = buildPayload(input, zoneName, row.provider, metadata.settings);
  return row.provider === "cloudflare"
    ? cloudflareUpdateRecord(secret, zoneName, recordId, payload)
    : gcoreCreateOrUpdateRecord(secret, zoneName, payload, "put");
}

export async function deleteConnectionRecord(connectionId: string, zoneName: string, recordId: string) {
  const { row, secret } = await assertZoneAllowed(connectionId, zoneName);
  return row.provider === "cloudflare"
    ? cloudflareDeleteRecord(secret, zoneName, recordId)
    : gcoreDeleteRecord(secret, zoneName, recordId);
}


