export type ClosingPeriod = "weekly" | "biweekly" | "monthly";
export type PaymentStatus = "pending" | "partial" | "paid";

const DAY = 86_400_000;
const parse = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Data inválida");
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error("Data inválida");
  return t;
};
const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Último dia (inclusive) do fechamento que começa em `startISO` (AAAA-MM-DD). */
export function closingEnd(period: ClosingPeriod, startISO: string): string {
  const t = parse(startISO);
  if (period === "weekly") return fmt(t + 6 * DAY);
  if (period === "biweekly") return fmt(t + 14 * DAY);
  const d = new Date(t);
  return fmt(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/** Valor líquido do fechamento: corridas + ajustes (descontos são negativos). */
export function closingNet(ridesCents: number, adjustmentsCents: number): number {
  return ridesCents + adjustmentsCents;
}

/** Mesma regra de recalc_closing no banco. */
export function closingStatus(netCents: number, paidCents: number): PaymentStatus {
  if (netCents > 0 && paidCents >= netCents) return "paid";
  if (paidCents > 0) return "partial";
  return "pending";
}

export function remainingCents(netCents: number, paidCents: number): number {
  return Math.max(0, netCents - paidCents);
}
