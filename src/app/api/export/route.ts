import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProfile, hasAdminAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buildWorkbook, fetchRides } from "@/lib/reports/data";
import { HEADERS, rideToRow, toCsv } from "@/lib/reports/rows";

const schema = z.object({
  formato: z.enum(["xlsx", "csv"]).default("xlsx"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  driver: z.string().uuid().optional(),
  client: z.string().uuid().optional(),
});

export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile?.active || profile.role === "driver" || !(await hasAdminAccess())) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const parsed = schema.safeParse(Object.fromEntries([...req.nextUrl.searchParams].filter(([, v]) => v !== "")));
  if (!parsed.success) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });
  const { formato, from, to, driver, client } = parsed.data;
  if (from > to) return NextResponse.json({ error: "Período inválido" }, { status: 400 });

  const { rides } = await fetchRides(await createClient(), { from, to, driver, client });
  const name = `corridas_${from}_a_${to}`;
  if (formato === "csv") {
    return new NextResponse(toCsv(HEADERS, rides.map(rideToRow)), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
    });
  }
  return new NextResponse(new Uint8Array(await buildWorkbook(rides)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`, "Cache-Control": "no-store",
    },
  });
}
