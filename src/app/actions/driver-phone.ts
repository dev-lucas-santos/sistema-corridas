"use server";

import { createHmac, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/jobs";
import type { FormState } from "./auth";

async function driverAccount() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email_confirmed_at) return null;
  const { data: profile, error: profileError } = await supabase.from("profiles").select("id, role, active").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("Falha ao carregar o perfil do motorista");
  if (!profile?.active || profile.role !== "driver") return null;
  const { data: driver, error: driverError } = await supabase.from("drivers").select("active").eq("profile_id", user.id).maybeSingle();
  if (driverError) throw new Error("Falha ao carregar o vínculo do motorista");
  if (driver && !driver.active) return null;
  return user.id;
}

function configuration() {
  const { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneId,
    WHATSAPP_AUTH_TEMPLATE: template, WHATSAPP_AUTH_LANGUAGE: language,
    WHATSAPP_API_VERSION: version, DRIVER_PHONE_OTP_SECRET: secret } = process.env;
  if (!token || !phoneId || !/^\d+$/.test(phoneId) || !template || !language ||
      !version || !/^v\d+\.\d+$/.test(version) || !secret || secret.length < 32) return null;
  return { token, phoneId, template, language, version, secret };
}

function codeHash(secret: string, user: string, phone: string, code: string) {
  return createHmac("sha256", secret).update(`${user}:${phone}:${code}`).digest("hex");
}

export async function requestDriverPhone(_: FormState, fd: FormData): Promise<FormState> {
  const raw = z.string().trim().regex(/^[+\d\s().-]+$/, "Informe um telefone válido.").safeParse(fd.get("phone"));
  if (!raw.success) return { error: "Informe um número de WhatsApp válido com DDD." };
  const digits = raw.data.replace(/\D/g, "");
  const phone = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  if (!/^55[1-9]\d9\d{8}$/.test(phone)) return { error: "Informe um celular brasileiro com DDD, por exemplo (11) 99999-9999." };
  const config = configuration();
  if (!config) return { error: "A confirmação por WhatsApp ainda não está configurada. Entre em contato com a base." };

  try {
    const user = await driverAccount();
    if (!user) return { error: "Entre com uma conta de motorista ativa e com e-mail confirmado." };
    const admin = adminClient();
    for (const key of [`driver-phone-user:${user}`, `driver-phone-number:${phone}`]) {
      const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_limit: 3, p_window_seconds: 3600 });
      if (error) throw new Error("Falha no limite de solicitações");
      if (data !== true) return { error: "Muitas solicitações. Aguarde e tente novamente mais tarde." };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const hash = codeHash(config.secret, user, `+${phone}`, code);
    const { error: saveError } = await admin.from("driver_phone_challenges").upsert({
      profile_id: user, phone: `+${phone}`, code_hash: hash,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), attempts: 0,
    });
    if (saveError) throw new Error("Falha ao preparar confirmação");
    let response: Response;
    try {
      response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "template",
          template: { name: config.template, language: { code: config.language }, components: [
            { type: "body", parameters: [{ type: "text", text: code }] },
            { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
          ] },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Meta respondeu HTTP ${response.status}`);
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || !("messages" in result) || !Array.isArray(result.messages) || result.messages.length === 0) {
        throw new Error("Meta não confirmou o envio");
      }
    } catch (error) {
      const { error: deleteError } = await admin.from("driver_phone_challenges").delete()
        .eq("profile_id", user).eq("code_hash", hash);
      if (deleteError) console.error("Falha ao invalidar código de WhatsApp", deleteError.message);
      throw error;
    }
    return { ok: "Solicitação enviada. Confira o WhatsApp e informe o código em até 10 minutos." };
  } catch (error) {
    console.error("Falha ao solicitar confirmação de WhatsApp", error);
    return { error: "Não foi possível enviar o código. Tente novamente ou contate a base." };
  }
}

export async function confirmDriverPhone(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.string().regex(/^\d{6}$/).safeParse(fd.get("code"));
  if (!parsed.success) return { error: "Informe o código de 6 dígitos." };
  const config = configuration();
  if (!config) return { error: "A confirmação por WhatsApp ainda não está configurada. Entre em contato com a base." };
  try {
    const user = await driverAccount();
    if (!user) return { error: "Entre com uma conta de motorista ativa e com e-mail confirmado." };
    const admin = adminClient();
    const { data: challenge, error: readError } = await admin.from("driver_phone_challenges").select("phone").eq("profile_id", user).maybeSingle();
    if (readError) throw new Error("Falha ao consultar confirmação");
    if (!challenge) return { error: "Código inválido ou expirado. Solicite outro código." };
    const { data, error } = await admin.rpc("confirm_driver_phone", {
      p_profile: user, p_hash: codeHash(config.secret, user, challenge.phone, parsed.data),
    });
    if (error) throw new Error("Falha ao confirmar telefone");
    if (data !== true) return { error: "Código inválido ou expirado. Solicite outro código." };
    revalidatePath("/motorista");
    revalidatePath("/motorista/telefone");
    revalidatePath("/motoristas");
    return { ok: "WhatsApp confirmado com sucesso." };
  } catch (error) {
    console.error("Falha ao confirmar WhatsApp", error);
    return { error: "Não foi possível confirmar o código. Tente novamente ou contate a base." };
  }
}
