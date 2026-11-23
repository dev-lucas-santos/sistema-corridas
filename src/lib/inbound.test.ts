import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizePhone, normalizePrice, toFormValues } from "./ai/extract";
import { parseEmail, parseWhatsApp, verifyMetaSignature } from "./inbound";

describe("extração", () => {
  it("normaliza telefone e valor", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("(11) 98765-4321");
    expect(normalizePhone("123")).toBe("");
    expect(normalizePrice(1234.5)).toBe("1234,50");
    expect(normalizePrice("R$ 1.234,50")).toBe("1234,50");
    expect(normalizePrice(-3)).toBe("");
  });
  it("valida a saída da IA e descarta campos inválidos", () => {
    const v = toFormValues({ passenger_name: " Ana ", date: "2025-03-10", time: "07:30", price_reais: 85, passenger_phone: "11987654321" });
    expect(v.scheduled_at_local).toBe("2025-03-10T07:30");
    expect(v.passenger_name).toBe("Ana");
    expect(toFormValues({ date: "amanhã", time: "25:00" }).scheduled_at_local).toBe("");
    expect(toFormValues({ date: "2025-03-10", time: null }).scheduled_at_local).toBe("2025-03-10T08:00");
  });
});

describe("webhooks", () => {
  const body = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "5511", profile: { name: "Zé" } }], messages: [
    { id: "m1", from: "5511", type: "text", text: { body: "oi" } }, { id: "m2", from: "5511", type: "image" }] } }] }] });
  it("verifica assinatura HMAC", () => {
    const sig = "sha256=" + createHmac("sha256", "s").update(body).digest("hex");
    expect(verifyMetaSignature(body, sig, "s")).toBe(true);
    expect(verifyMetaSignature(body + " ", sig, "s")).toBe(false);
    expect(verifyMetaSignature(body, null, "s")).toBe(false);
  });
  it("lê só mensagens de texto do WhatsApp", () => {
    const m = parseWhatsApp(JSON.parse(body));
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ external_id: "m1", sender_name: "Zé" });
    expect(parseWhatsApp({})).toEqual([]);
  });
  it("lê e-mail estilo Postmark", () => {
    expect(parseEmail({ MessageID: "a", From: "x@y", Subject: "s", TextBody: "corpo" })?.subject).toBe("s");
    expect(parseEmail({ TextBody: "sem id" })).toBeNull();
  });
});
