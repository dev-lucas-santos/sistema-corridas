import { NextResponse, type NextRequest } from "next/server";
import { parseEmail, safeEqual } from "@/lib/inbound";
import { MAX_BODY, clientIp, storeInbound, withinRateLimit } from "@/lib/inbound-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.EMAIL_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  if (!(await withinRateLimit(`em:${clientIp(req)}`))) return NextResponse.json({ error: "limite excedido" }, { status: 429 });

  const auth = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? req.nextUrl.searchParams.get("secret") ?? "";
  if (!safeEqual(auth, secret)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "corpo grande demais" }, { status: 413 });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const msg = parseEmail(payload);
  if (!msg) return NextResponse.json({ error: "e-mail sem corpo ou identificador" }, { status: 422 });
  try {
    await storeInbound([msg]);
  } catch {
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
