import "server-only";
import { createSign } from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const b64 = (v: object | Buffer) => Buffer.from(v instanceof Buffer ? v : JSON.stringify(v)).toString("base64url");

export function sheetsConfigured() {
  return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_SHEETS_ID);
}

let cached: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const sig = createSign("RSA-SHA256").update(unsigned).sign(process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64(sig)}` }),
  });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, exp: Date.now() + json.expires_in * 1000 };
  return cached.token;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEETS_ID}${path}`, {
    ...init, headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

/** Nomes de aba: sem caracteres proibidos e com no máximo 90 caracteres. */
export function sheetTab(prefix: string, name: string) {
  return `${prefix} ${name}`.replace(/[\\/?*[\]:']/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
}

async function ensureTab(tab: string, header: string[]) {
  const meta = await api<{ sheets?: { properties: { title: string } }[] }>("?fields=sheets.properties.title");
  if (meta.sheets?.some((s) => s.properties.title.toLowerCase() === tab.toLowerCase())) return;
  try {
    await api(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab, gridProperties: { frozenRowCount: 1 } } } }] }) });
  } catch (e) {
    if (!/already exists/i.test(String(e))) throw e;
    return;
  }
  await append(tab, header);
}

async function append(tab: string, row: (string | number)[]) {
  await api(`/values/${encodeURIComponent(`'${tab}'!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values: [row] }),
  });
}

/** Cria a aba (com cabeçalho) se não existir e acrescenta uma linha. */
export async function appendRow(tab: string, header: string[], row: (string | number)[]) {
  await ensureTab(tab, header);
  await append(tab, row);
}
