const TZ = "America/Sao_Paulo";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, dateStyle: "short" }).format(new Date(iso));
}

/** ISO -> valor de <input type="datetime-local"> no fuso de São Paulo */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  return p.replace(" ", "T");
}

/** "YYYY-MM-DDTHH:mm" (horário de Brasília) -> ISO UTC. O Brasil não tem horário de verão desde 2019 (UTC-3 fixo). */
export function fromLocalInput(v: string): string {
  return new Date(`${v}:00-03:00`).toISOString();
}

/** Início/fim de um dia (YYYY-MM-DD) em Brasília, como ISO */
export function dayStartISO(d: string) { return new Date(`${d}T00:00:00-03:00`).toISOString(); }
export function dayEndISO(d: string) { return new Date(`${d}T23:59:59.999-03:00`).toISOString(); }

export function todayBR(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
}
