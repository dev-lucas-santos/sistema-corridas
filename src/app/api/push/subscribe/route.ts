import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  const { endpoint, keys } = parsed.data;
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: uid, endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: "endpoint" });
  if (error) return NextResponse.json({ error: "Não foi possível salvar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await createClient();
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
