export type Frequency = "daily" | "weekly" | "monthly";

const parse = (d: string) => new Date(`${d}T00:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: string, n: number) => { const x = parse(d); x.setUTCDate(x.getUTCDate() + n); return fmt(x); };
const lastDayOfMonth = (y: number, m0: number) => fmt(new Date(Date.UTC(y, m0 + 1, 0)));

/** Intervalo (inclusive) do relatório que contém a data de referência. Semana: segunda a domingo. */
export function rangeFor(freq: Frequency, ref: string): { start: string; end: string } {
  if (freq === "daily") return { start: ref, end: ref };
  const d = parse(ref);
  if (freq === "weekly") {
    const offset = (d.getUTCDay() + 6) % 7;
    const start = addDays(ref, -offset);
    return { start, end: addDays(start, 6) };
  }
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  return { start: fmt(new Date(Date.UTC(y, m, 1))), end: lastDayOfMonth(y, m) };
}

/** Período já encerrado a ser enviado quando hoje é `today`. Retorna null se hoje não é dia de envio. */
export function dueRange(freq: Frequency, today: string): { start: string; end: string } | null {
  const d = parse(today);
  if (freq === "daily") { const y = addDays(today, -1); return { start: y, end: y }; }
  if (freq === "weekly") return d.getUTCDay() === 1 ? rangeFor("weekly", addDays(today, -1)) : null;
  return d.getUTCDate() === 1 ? rangeFor("monthly", addDays(today, -1)) : null;
}
