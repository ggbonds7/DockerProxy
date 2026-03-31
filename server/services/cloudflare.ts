import axios from "axios";
import { CONFIG } from "../utils/config";

export function getCfClient() {
  if (!CONFIG.CF_API_TOKEN) throw new Error("Cloudflare API Token 未配置");
  return axios.create({
    baseURL: "https://api.cloudflare.com/client/v4",
    headers: {
      "Authorization": `Bearer ${CONFIG.CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
}

export async function getZoneId(domain: string): Promise<string> {
  const cf = getCfClient();
  try {
    const res = await cf.get("/zones");
    if (res.data.success && res.data.result.length > 0) {
      const zones = res.data.result;
      const exactMatch = zones.find((z: any) => domain === z.name || domain.endsWith(`.${z.name}`));
      if (exactMatch) return exactMatch.id;
    }
  } catch (error: any) {
    console.warn("无法通过 API 获取 Zone 列表，将尝试使用配置的 CF_ZONE_ID:", error.message);
  }
  
  if (CONFIG.CF_ZONE_ID) return CONFIG.CF_ZONE_ID;
  throw new Error(`无法找到域名 ${domain} 对应的 Zone ID，且 .env 中未配置默认 CF_ZONE_ID`);
}

export async function getDnsRecords(domain: string) {
  const cf = getCfClient();
  const zoneId = await getZoneId(domain);
  const res = await cf.get(`/zones/${zoneId}/dns_records`);
  return res.data.result;
}

export async function createDnsRecord(domain: string, payload: any) {
  const cf = getCfClient();
  const zoneId = await getZoneId(domain);
  const res = await cf.post(`/zones/${zoneId}/dns_records`, payload);
  return res.data.result;
}

export async function updateDnsRecord(domain: string, id: string, payload: any) {
  const cf = getCfClient();
  const zoneId = await getZoneId(domain);
  const res = await cf.put(`/zones/${zoneId}/dns_records/${id}`, payload);
  return res.data.result;
}

export async function deleteDnsRecord(domain: string, id: string) {
  const cf = getCfClient();
  const zoneId = await getZoneId(domain);
  const res = await cf.delete(`/zones/${zoneId}/dns_records/${id}`);
  return res.data.result;
}
