"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/inbound-server";
import { adminClient } from "@/lib/jobs";

export type FormState = { error?: string; ok?: string } | undefined;

const loginSchema = z.object({ email: z.string().email("E-mail inválido"), password: z.string().min(1, "Informe a senha") });

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await withinRateLimit(`login:${ip}`, 10, 300))) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "E-mail ou senha incorretos." };
  const { data: profile } = await supabase.from("profiles").select("active, role").eq("id", data.user.id).single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "Seu cadastro ainda está aguardando aprovação do administrador." };
  }
  if (profile.role === "driver" && !data.user.email_confirmed_at) {
    await supabase.auth.signOut();
    return { error: "Confirme seu e-mail antes de entrar." };
  }
  redirect("/");
}

const signupSchema = z.object({
  full_name: z.string().trim().min(3, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

export async function loginDriver(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await withinRateLimit(`login:${ip}`, 10, 300))) return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  const temporary = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await temporary.auth.signInWithPassword(parsed.data);
  if (error || !data.user || !data.session) return { error: "E-mail ou senha incorretos." };
  const { data: profile, error: profileError } = await temporary.from("profiles").select("active, role").eq("id", data.user.id).single();
  if (profileError || !profile?.active || profile.role !== "driver" || !data.user.email_confirmed_at) {
    const { error: signOutError } = await temporary.auth.signOut({ scope: "local" });
    if (signOutError) console.error("Não foi possível encerrar a sessão temporária", signOutError.message);
    if (profileError) {
      console.error("Não foi possível verificar o perfil do motorista", profileError.message);
      return { error: "Não foi possível verificar sua conta. Tente novamente." };
    }
    if (profile?.role !== "driver") return { error: "Esta conta é da base. Entre com uma conta de motorista." };
    if (!profile.active) return { error: "Seu acesso está inativo. Entre em contato com a base." };
    return { error: "Confirme seu e-mail antes de entrar." };
  }
  const { error: sessionError } = await (await createClient()).auth.setSession({
    access_token: data.session.access_token, refresh_token: data.session.refresh_token,
  });
  if (sessionError) {
    console.error("Não foi possível iniciar a sessão do motorista", sessionError.message);
    const { error: signOutError } = await temporary.auth.signOut({ scope: "local" });
    if (signOutError) console.error("Não foi possível encerrar a sessão temporária", signOutError.message);
    return { error: "Não foi possível iniciar sua sessão. Tente novamente." };
  }
  redirect("/motorista");
}

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await withinRateLimit(`signup:${ip}`, 5, 3600))) return { error: "Muitas tentativas. Tente novamente mais tarde." };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: `${h.get("origin") ?? `https://${h.get("host")}`}/auth/callback?next=/login` },
  });
  if (error?.code === "signup_disabled") return { error: "Novos cadastros estão temporariamente desativados. Entre em contato com o administrador." };
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") return { error: "Não foi possível concluir o cadastro. Verifique os dados e tente de novo." };
  if (data.session) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) return { error: "Não foi possível encerrar a sessão. Entre em contato com a base." };
  }
  return { ok: "Se o e-mail puder ser cadastrado, confira sua caixa de entrada. O acesso de operador também depende de aprovação do administrador." };
}

export async function signupDriver(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const supabase = await createClient();
  const { data: ready, error: migrationError } = await supabase.rpc("driver_signup_ready");
  if (migrationError || ready !== true) return { error: "O cadastro de motoristas ainda não está disponível. Entre em contato com a base." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { error: "O cadastro ainda não está configurado. Entre em contato com a base." };
  try {
    const { data: allowed, error } = await adminClient().rpc("rate_limit_hit", { p_key: `driver-signup:${ip}`, p_limit: 5, p_window_seconds: 3600 });
    if (error) throw new Error(error.message);
    if (allowed !== true) return { error: "Muitas tentativas. Tente novamente mais tarde." };
    const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, cache: "no-store" });
    if (!response.ok) throw new Error(`Configuração de autenticação: HTTP ${response.status}`);
    const settings: unknown = await response.json();
    if (!settings || typeof settings !== "object" || !("mailer_autoconfirm" in settings) || !("disable_signup" in settings)) {
      throw new Error("Configuração de autenticação incompleta");
    }
    if (settings.disable_signup === true) return { error: "Novos cadastros estão temporariamente desativados. Entre em contato com a base." };
    if (settings.disable_signup !== false || settings.mailer_autoconfirm !== false) {
      return { error: "A confirmação de e-mail ainda não está configurada. Entre em contato com a base." };
    }
  } catch (error) {
    console.error("Não foi possível verificar o cadastro de motoristas", error);
    return { error: "Não foi possível verificar o cadastro agora. Tente novamente mais tarde." };
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name, account_type: "driver" },
      emailRedirectTo: `${h.get("origin") ?? `https://${h.get("host")}`}/auth/callback?next=/motorista`,
    },
  });
  if (error?.code === "signup_disabled") return { error: "Novos cadastros estão temporariamente desativados. Entre em contato com a base." };
  if (error && error.code !== "user_already_exists" && error.code !== "email_exists") {
    return { error: "Não foi possível solicitar o cadastro. Verifique os dados e tente novamente." };
  }
  if (data.session) {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) return { error: "Não foi possível encerrar a sessão. Entre em contato com a base." };
    return { error: "A confirmação de e-mail não está configurada corretamente. Entre em contato com a base." };
  }
  return { ok: "Se o e-mail puder ser cadastrado, você receberá um link de confirmação. Depois, a base vinculará suas corridas à sua conta." };
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("Não foi possível encerrar a sessão.");
  redirect("/login");
}

export async function requestReset(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.string().email("E-mail inválido").safeParse(fd.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await withinRateLimit(`reset:${ip}`, 5, 600))) return { error: "Muitas tentativas. Aguarde alguns minutos." };
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` });
  // Resposta idêntica exista ou não o e-mail (evita enumeração de usuários)
  return { ok: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
}

export async function updatePassword(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = z.object({ password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"), confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Não foi possível atualizar a senha. Peça um novo link." };
  redirect("/");
}
