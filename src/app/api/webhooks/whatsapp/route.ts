import { NextResponse, type NextRequest } from "next/server";
import { parseWhatsApp, safeEqual, verifyMetaSignature } from "@/lib/inbound";
import { MAX_BODY, clientIp, storeInbound, withinRateLimit } from "@/lib/inbound-server";

export const runtime = "nodejs";

// Verificação do webhook (Meta chama uma vez ao cadastrar)
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && safeEqual(q.get("hub.verify_token") ?? "", token)) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return NextResponse.json({ error: "não configurado" }, { status: 503 });
  if (!(await withinRateLimit(`wa:${clientIp(req)}`))) return NextResponse.json({ error: "limite excedido" }, { status: 429 });

  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "corpo grande demais" }, { status: 413 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"), secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  try {
    await storeInbound(parseWhatsApp(payload));
  } catch {
    // 500 faz a Meta reenviar; o dedupe por id evita duplicidade
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
