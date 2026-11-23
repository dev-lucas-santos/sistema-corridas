import { describe, expect, it } from "vitest";
import { dueRange, rangeFor } from "./period";
import { rideToRow, safeText, summarize, toCsv, type ReportRide } from "./rows";

describe("períodos de relatório", () => {
  it("diário", () => expect(rangeFor("daily", "2026-03-10")).toEqual({ start: "2026-03-10", end: "2026-03-10" }));
  it("semanal vai de segunda a domingo", () => {
    expect(rangeFor("weekly", "2026-03-11")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    expect(rangeFor("weekly", "2026-03-15")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
    expect(rangeFor("weekly", "2026-03-09")).toEqual({ start: "2026-03-09", end: "2026-03-15" });
  });
  it("mensal, inclusive fevereiro bissexto", () => {
    expect(rangeFor("monthly", "2028-02-10")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(rangeFor("monthly", "2026-12-31")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
  it("envio: diário sempre usa ontem", () => expect(dueRange("daily", "2026-03-01")).toEqual({ start: "2026-02-28", end: "2026-02-28" }));
  it("envio: semanal só na segunda, cobrindo a semana anterior", () => {
    expect(dueRange("weekly", "2026-03-10")).toBeNull();
    expect(dueRange("weekly", "2026-03-09")).toEqual({ start: "2026-03-02", end: "2026-03-08" });
  });
  it("envio: mensal só no dia 1, cobrindo o mês anterior (virada de ano)", () => {
    expect(dueRange("monthly", "2026-03-02")).toBeNull();
    expect(dueRange("monthly", "2027-01-01")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
  });
});

describe("exportação", () => {
  const ride: ReportRide = {
    id: "x", code: 7, status: "completed", scheduled_at: "2026-03-10T10:00:00Z", finished_at: "2026-03-10T11:30:00Z",
    passenger_name: "=HYPERLINK(\"http://x\")", passenger_phone: null, origin: "A; B", destination: "C",
    price_cents: 10050, driver_payout_cents: 7035, clients: { legal_name: "ACME" }, drivers: null,
  };
  it("neutraliza fórmulas", () => {
    expect(safeText("=1+1")).toBe("'=1+1");
    expect(safeText("João")).toBe("João");
    expect(rideToRow(ride)[4]).toMatch(/^'=/);
  });
  it("calcula margem em reais a partir de centavos, no fuso de Brasília", () => {
    const row = rideToRow(ride);
    expect(row.slice(10)).toEqual([100.5, 70.35, 30.15]);
    expect(row[1]).toBe("10/03/2026");
    expect(row[2]).toBe("08:30");
  });
  it("corrida cancelada não gera repasse nem margem", () => {
    expect(rideToRow({ ...ride, status: "cancelled" }).slice(11)).toEqual([0, 0]);
  });
  it("resumo soma só corridas realizadas e conta canceladas", () => {
    expect(summarize([
      { status: "completed", price_cents: 10000, driver_payout_cents: 7000 },
      { status: "completed", price_cents: 5001, driver_payout_cents: 3500 },
      { status: "cancelled", price_cents: 9999, driver_payout_cents: 9999 },
    ])).toEqual({ completed: 2, cancelled: 1, revenue: 15001, payout: 10500, margin: 4501 });
  });
  it("CSV com vírgula decimal, aspas e BOM", () => {
    const csv = toCsv(["a", "b"], [["x;y", 1.5], ['q"r', 2]]);
    expect(csv.startsWith("\ufeff")).toBe(true);
    expect(csv).toContain('"x;y";1,50');
    expect(csv).toContain('"q""r";2,00');
  });
});
