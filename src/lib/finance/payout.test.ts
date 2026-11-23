import { describe, it, expect } from "vitest";
import { calcDriverPayout, calcMargin } from "./payout";
import { parseBRLToCents, formatBRL } from "../money";

describe("calcDriverPayout", () => {
  it("percentual simples", () => expect(calcDriverPayout(10000, { type: "percent", percentBp: 7000 })).toBe(7000));
  it("arredonda para baixo frações de centavo", () => expect(calcDriverPayout(1001, { type: "percent", percentBp: 7000 })).toBe(700));
  it("100% e 0%", () => {
    expect(calcDriverPayout(5555, { type: "percent", percentBp: 10000 })).toBe(5555);
    expect(calcDriverPayout(5555, { type: "percent", percentBp: 0 })).toBe(0);
  });
  it("valor fixo", () => expect(calcDriverPayout(10000, { type: "fixed", fixedCents: 6000 })).toBe(6000));
  it("valor fixo nunca excede o valor da corrida", () => expect(calcDriverPayout(4000, { type: "fixed", fixedCents: 6000 })).toBe(4000));
  it("rejeita entradas inválidas", () => {
    expect(() => calcDriverPayout(10.5, { type: "fixed", fixedCents: 1 })).toThrow();
    expect(() => calcDriverPayout(100, { type: "percent", percentBp: 10001 })).toThrow();
    expect(() => calcDriverPayout(-1, { type: "percent", percentBp: 100 })).toThrow();
  });
  it("soma de repasses + margem == total (sem perder centavos)", () => {
    const prices = [999, 1001, 3333, 12345];
    for (const p of prices) {
      const pay = calcDriverPayout(p, { type: "percent", percentBp: 6667 });
      expect(pay + calcMargin(p, pay)).toBe(p);
    }
  });
});

describe("parseBRLToCents", () => {
  it.each([
    ["85", 8500], ["85,5", 8550], ["85,50", 8550], ["1.234,56", 123456], ["R$ 1.000,00", 100000], ["0,07", 7], ["", 0],
  ])("%s -> %i", (i, o) => expect(parseBRLToCents(i)).toBe(o));
  it("formata BRL", () => expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56"));
});
