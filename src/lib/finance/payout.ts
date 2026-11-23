export type PayoutRule =
  | { type: "percent"; percentBp: number } // 7000 = 70,00%
  | { type: "fixed"; fixedCents: number };

/** Repasse ao motorista em centavos, sempre inteiro. Percentual arredonda para baixo (floor) em favor da base em frações de centavo. */
export function calcDriverPayout(priceCents: number, rule: PayoutRule): number {
  if (!Number.isInteger(priceCents) || priceCents < 0) throw new Error("Valor da corrida inválido");
  if (rule.type === "fixed") {
    if (!Number.isInteger(rule.fixedCents) || rule.fixedCents < 0) throw new Error("Valor fixo inválido");
    return Math.min(rule.fixedCents, priceCents);
  }
  if (!Number.isInteger(rule.percentBp) || rule.percentBp < 0 || rule.percentBp > 10000) throw new Error("Percentual inválido");
  return Math.floor((priceCents * rule.percentBp) / 10000);
}

export function calcMargin(priceCents: number, payoutCents: number): number {
  return priceCents - payoutCents;
}
