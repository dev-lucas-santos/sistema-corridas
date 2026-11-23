import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminClient, enqueueDueReports, processJobs } from "@/lib/jobs";

export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// Chamado pelo cron da Vercel (vercel.json): enfileira relatórios agendados e processa a fila.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const admin = adminClient();
    const queued = await enqueueDueReports(admin);
    return NextResponse.json({ queued, ...(await processJobs(admin)) });
  } catch (e) {
    console.error("cron tick", e);
    return NextResponse.json({ error: "Falha ao processar a fila" }, { status: 500 });
  }
}
