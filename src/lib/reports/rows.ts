import { RIDE_STATUS } from "../labels";

export type ReportRide = {
  id: string;
  code: number;
  status: string;
  scheduled_at: string;
  finished_at: string | null;
  passenger_name: string;
  passenger_phone: string | null;
  origin: string;
  destination: string;
  price_cents: number;
  driver_payout_cents: number;
  clients: { legal_name: string } | null;
  drivers: { full_name: string } | null;
};

export const RIDE_SELECT =
  "id, code, status, scheduled_at, finished_at, passenger_name, passenger_phone, origin, destination, price_cents, driver_payout_cents, clients(legal_name), drivers(full_name)";

export const HEADERS = ["Código", "Data", "Hora", "Status", "Passageiro", "Telefone", "Cliente", "Motorista", "Origem", "Destino", "Valor (R$)", "Repasse (R$)", "Margem (R$)"];

const TZ = "America/Sao_Paulo";
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" });
const timeFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, timeStyle: "short" });

export type Cell = string | number;

/** Evita injeção de fórmulas ao abrir no Excel/Sheets: textos de terceiros iniciados por = + - @ viram texto literal. */
export function safeText(v: string | null | undefined): string {
  const s = v ?? "";
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function rideToRow(r: ReportRide): Cell[] {
  const at = new Date(r.finished_at ?? r.scheduled_at);
  const done = r.status === "completed";
  return [
    r.code, dateFmt.format(at), timeFmt.format(at), RIDE_STATUS[r.status]?.label ?? r.status,
    safeText(r.passenger_name), safeText(r.passenger_phone), safeText(r.clients?.legal_name), safeText(r.drivers?.full_name),
    safeText(r.origin), safeText(r.destination),
    r.price_cents / 100, done ? r.driver_payout_cents / 100 : 0, done ? (r.price_cents - r.driver_payout_cents) / 100 : 0,
  ];
}

export function summarize(rides: Pick<ReportRide, "status" | "price_cents" | "driver_payout_cents">[]) {
  let completed = 0, cancelled = 0, revenue = 0, payout = 0;
  for (const r of rides) {
    if (r.status === "completed") { completed++; revenue += r.price_cents; payout += r.driver_payout_cents; }
    else if (r.status === "cancelled") cancelled++;
  }
  return { completed, cancelled, revenue, payout, margin: revenue - payout };
}

/** CSV para Excel em pt-BR: separador ";", decimal com vírgula e BOM UTF-8. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (c: Cell) => {
    const s = typeof c === "number" ? c.toFixed(2).replace(".", ",") : c;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\ufeff" + [header, ...rows].map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}
