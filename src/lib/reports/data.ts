import "server-only";
import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayEndISO, dayStartISO } from "@/lib/dates";
import { HEADERS, RIDE_SELECT, rideToRow, type Cell, type ReportRide } from "./rows";

export const MAX_EXPORT_ROWS = 50000;
const PAGE = 1000;

export type RideFilters = { from: string; to: string; driver?: string; client?: string; status?: string[] };

/** Busca as corridas em páginas de 1000 (com cliente e motorista embutidos: sem N+1). Corta em MAX_EXPORT_ROWS. */
export async function fetchRides(supabase: SupabaseClient, f: RideFilters): Promise<{ rides: ReportRide[]; truncated: boolean }> {
  const a = dayStartISO(f.from), b = dayEndISO(f.to);
  const rides: ReportRide[] = [];
  for (let offset = 0; offset < MAX_EXPORT_ROWS; offset += PAGE) {
    let q = supabase.from("rides").select(RIDE_SELECT)
      .in("status", f.status?.length ? f.status : ["completed", "cancelled"])
      .or(`and(finished_at.gte.${a},finished_at.lte.${b}),and(finished_at.is.null,scheduled_at.gte.${a},scheduled_at.lte.${b})`)
      .order("scheduled_at").order("id").range(offset, offset + PAGE - 1);
    if (f.driver) q = q.eq("driver_id", f.driver);
    if (f.client) q = q.eq("client_id", f.client);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    rides.push(...((data ?? []) as unknown as ReportRide[]));
    if ((data?.length ?? 0) < PAGE) return { rides, truncated: false };
  }
  return { rides, truncated: true };
}

function tabName(prefix: string, name: string, used: Set<string>) {
  const base = `${prefix} ${name}`.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28);
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) n = `${base.slice(0, 26)} ${i++}`;
  used.add(n.toLowerCase());
  return n;
}

function addTable(ws: ExcelJS.Worksheet, header: string[], rows: Cell[][], moneyCols: number[]) {
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.columns.forEach((c, i) => { c.width = [0, 1, 2, 3].includes(i) ? 12 : Math.min(36, Math.max(12, header[i].length + 2)); });
  moneyCols.forEach((i) => { ws.getColumn(i + 1).numFmt = '"R$" #,##0.00'; });
}

/** Abas: Consolidado, Por dia, uma por motorista e uma por cliente. */
export async function buildWorkbook(rides: ReportRide[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const used = new Set<string>(["consolidado", "por dia"]);
  const money = [10, 11, 12];

  addTable(wb.addWorksheet("Consolidado"), HEADERS, rides.map(rideToRow), money);

  const days = new Map<string, { label: string; done: number; canc: number; rev: number; pay: number }>();
  const byDriver = new Map<string, ReportRide[]>();
  const byClient = new Map<string, ReportRide[]>();
  for (const r of rides) {
    const row = rideToRow(r);
    const key = (row[1] as string).split("/").reverse().join("-");
    const d = days.get(key) ?? { label: row[1] as string, done: 0, canc: 0, rev: 0, pay: 0 };
    if (r.status === "completed") { d.done++; d.rev += r.price_cents; d.pay += r.driver_payout_cents; } else d.canc++;
    days.set(key, d);
    const dn = r.drivers?.full_name ?? "Sem motorista", cn = r.clients?.legal_name ?? "Sem cliente";
    byDriver.set(dn, [...(byDriver.get(dn) ?? []), r]);
    byClient.set(cn, [...(byClient.get(cn) ?? []), r]);
  }
  addTable(wb.addWorksheet("Por dia"), ["Dia", "Realizadas", "Canceladas", "Faturado (R$)", "Repasse (R$)", "Margem (R$)"],
    [...days.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, d]) => [d.label, d.done, d.canc, d.rev / 100, d.pay / 100, (d.rev - d.pay) / 100]), [3, 4, 5]);

  for (const [n, list] of byDriver) addTable(wb.addWorksheet(tabName("Mot.", n, used)), HEADERS, list.map(rideToRow), money);
  for (const [n, list] of byClient) addTable(wb.addWorksheet(tabName("Cli.", n, used)), HEADERS, list.map(rideToRow), money);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
