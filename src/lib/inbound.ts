import { createHmac, timingSafeEqual } from "node:crypto";

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Valida o header X-Hub-Signature-256 da Meta (HMAC SHA256 do corpo cru). */
export function verifyMetaSignature(rawBody: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqual(header.slice(7), expected);
}

export type InboundInput = { channel: "whatsapp" | "email"; external_id: string; sender: string | null; sender_name: string | null; subject: string | null; body: string };

/** Extrai mensagens de texto do payload do WhatsApp Business (Cloud API). */
export function parseWhatsApp(payload: unknown): InboundInput[] {
  const out: InboundInput[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const changes = (e as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const c of changes) {
      const v = (c as { value?: { messages?: { id?: string; from?: string; type?: string; text?: { body?: string } }[]; contacts?: { wa_id?: string; profile?: { name?: string } }[] } })?.value;
      for (const m of v?.messages ?? []) {
        if (m.type !== "text" || !m.id || !m.text?.body) continue;
        const name = v?.contacts?.find((x) => x.wa_id === m.from)?.profile?.name ?? null;
        out.push({ channel: "whatsapp", external_id: m.id, sender: m.from ?? null, sender_name: name, subject: null, body: m.text.body });
      }
    }
  }
  return out;
}

/** Aceita o formato Postmark (From, Subject, TextBody, MessageID) ou um JSON simples. */
export function parseEmail(p: Record<string, unknown>): InboundInput | null {
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  const body = s(p.TextBody) ?? s(p.text) ?? s(p.body);
  const id = s(p.MessageID) ?? s(p.message_id) ?? s(p.id);
  if (!body?.trim() || !id) return null;
  return {
    channel: "email", external_id: id,
    sender: s(p.From) ?? s(p.from), sender_name: s(p.FromName) ?? null,
    subject: s(p.Subject) ?? s(p.subject), body,
  };
}
