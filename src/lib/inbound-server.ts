import "server-only";
import type { NextRequest } from "next/server";
import { adminClient } from "@/lib/jobs";
import type { InboundInput } from "@/lib/inbound";

export const MAX_BODY = 100_000;

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

/** Retorna true se a chamada está dentro do limite. Em falha do banco, permite (a autenticação continua valendo). */
export async function withinRateLimit(key: string, limit = 120, windowSeconds = 60) {
  try {
    const { data, error } = await adminClient().rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    return error ? true : data === true;
  } catch {
    return true;
  }
}

/** Grava as mensagens (dedupe por canal + id) e enfileira a extração por IA. */
export async function storeInbound(items: InboundInput[]) {
  const admin = adminClient();
  let stored = 0;
  for (const m of items) {
    const { data, error } = await admin.from("inbound_messages")
      .upsert({ ...m, body: m.body.slice(0, 20_000) }, { onConflict: "channel,external_id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) continue;
    await admin.from("jobs").insert({ type: "inbound_extract", payload: { message_id: data[0].id } });
    stored++;
  }
  return stored;
}
