import "server-only";
import * as webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body?: string; url?: string; tag?: string };

// Envia push a todos os dispositivos do usuário; remove inscrições expiradas.
// Usa a service role porque a RLS só permite ler as próprias inscrições.
export async function sendPushToUser(userId: string, payload: PushPayload) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configure() || !key) return { sent: 0, skipped: true };
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(
    (subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("push falhou", status);
      }
    }),
  );
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, skipped: false };
}
