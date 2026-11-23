export function parseBRLToCents(input: string | null | undefined): number {
  if (!input) return 0;
  const clean = input.replace(/[^\d,.-]/g, "");
  // "1.234,56" -> 1234.56 ; "85" -> 85 ; "85,5" -> 85.5
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean;
  const [intPart, decPart = ""] = normalized.split(".");
  const int = Number(intPart || "0");
  if (!Number.isFinite(int)) return 0;
  const dec = Number((decPart + "00").slice(0, 2));
  return Math.sign(int || 1) * (Math.abs(int) * 100 + dec);
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function formatBRL(cents: number | null | undefined): string {
  return brl.format((cents ?? 0) / 100);
}

export function centsToInput(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace(".", ",");
}
