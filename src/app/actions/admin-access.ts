"use server";

import { scryptSync, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/jobs";
import type { FormState } from "./auth";

export async function unlockAdmin(_: FormState, fd: FormData): Promise<FormState> {
  const profile = await requireStaff();
  if (process.env.ADMIN_SESSION_ACCESS_ENABLED !== "1") {
    return { error: "A liberação por senha ainda não está ativada. Entre em contato com a base." };
  }
  const parsed = z.string().min(1).max(128).safeParse(fd.get("password"));
  if (!parsed.success) return { error: "Informe a senha administrativa." };
  const parts = process.env.ADMIN_ACCESS_PASSWORD_HASH?.split(":");
  if (!parts || parts.length !== 3 || parts[0] !== "scrypt" ||
      !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{64}$/.test(parts[2])) {
    return { error: "A senha administrativa ainda não está configurada." };
  }
  try {
    const supabase = await createClient();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    const sessionId = z.string().uuid().safeParse(data?.claims?.session_id);
    if (claimsError || data?.claims?.sub !== profile.id || !sessionId.success) {
      return { error: "Sua sessão é inválida. Entre novamente." };
    }
    const admin = adminClient();
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
    for (const [key, limit] of [[`admin-unlock-user:${profile.id}`, 5], [`admin-unlock-ip:${ip}`, 15]] as const) {
      const { data: allowed, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: 600 });
      if (error) throw new Error("Falha ao verificar limite de tentativas");
      if (allowed !== true) return { error: "Muitas tentativas. Aguarde e tente novamente." };
    }
    const expected = Buffer.from(parts[2], "hex");
    const actual = scryptSync(parsed.data, Buffer.from(parts[1], "hex"), expected.length);
    if (!timingSafeEqual(expected, actual)) return { error: "Senha administrativa incorreta." };
    const { error } = await admin.rpc("grant_admin_session", { p_user: profile.id, p_session: sessionId.data });
    if (error) throw new Error("Falha ao liberar a sessão administrativa");
  } catch (error) {
    console.error("Falha ao liberar acesso administrativo", error);
    return { error: "Não foi possível liberar o acesso. Verifique a configuração e tente novamente." };
  }
  revalidatePath("/", "layout");
  redirect("/administrador");
}
