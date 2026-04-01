export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string[];
}

export interface ProxyRoute {
  id: string;
  domain: string;
  target: string;
  ssl: boolean;
  createdAt: string;
}

export interface DNSRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
  ttl: number;
}

export interface AppConfig {
  nginxContainer: string;
  certAgentContainer: string;
  vpsIp: string;
  hasCfToken: boolean;
  hasCfZone: boolean;
  cfProxied: boolean;
  cfTtl: number;
  allowedDomains: string[];
}

export interface Certificate {
  domain: string;
  issueDate: string;
  expiryDate: string;
  status: 'valid' | 'expired' | 'renewing';
}
