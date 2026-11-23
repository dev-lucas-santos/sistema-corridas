import { describe, expect, it } from "vitest";
import { closingEnd, closingNet, closingStatus, remainingCents } from "./closing";

describe("closingEnd", () => {
  it("semanal: 7 dias corridos", () => expect(closingEnd("weekly", "2026-11-02")).toBe("2026-11-08"));
  it("quinzenal: 15 dias corridos", () => expect(closingEnd("biweekly", "2026-11-01")).toBe("2026-11-15"));
  it("mensal: último dia do mês", () => {
    expect(closingEnd("monthly", "2026-11-10")).toBe("2026-11-30");
    expect(closingEnd("monthly", "2028-02-01")).toBe("2028-02-29");
    expect(closingEnd("monthly", "2026-12-31")).toBe("2026-12-31");
  });
  it("cruza virada de mês e ano", () => expect(closingEnd("weekly", "2026-12-28")).toBe("2027-01-03"));
  it("rejeita data inválida", () => expect(() => closingEnd("weekly", "2026-13-45")).toThrow());
});

describe("closingNet / closingStatus", () => {
  it("soma acréscimos e subtrai descontos", () => expect(closingNet(100_000, -2_500 + 1_000)).toBe(98_500));
  it("pendente sem pagamento", () => expect(closingStatus(10_000, 0)).toBe("pending"));
  it("parcial", () => expect(closingStatus(10_000, 1)).toBe("partial"));
  it("pago ao quitar exatamente", () => expect(closingStatus(10_000, 10_000)).toBe("paid"));
  it("fechamento zerado não conta como pago", () => expect(closingStatus(0, 0)).toBe("pending"));
  it("saldo restante nunca é negativo", () => {
    expect(remainingCents(10_000, 4_000)).toBe(6_000);
    expect(remainingCents(10_000, 12_000)).toBe(0);
  });
});
