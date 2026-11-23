"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { withinRateLimit } from "@/lib/inbound-server";

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
  const { data: profile } = await supabase.from("profiles").select("active").eq("id", data.user.id).single();
  if (!profile?.active) {
    await supabase.auth.signOut();
    return { error: "Seu cadastro ainda está aguardando aprovação do administrador." };
  }
  redirect("/");
}

const signupSchema = z.object({
  full_name: z.string().trim().min(3, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres").max(72),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { message: "As senhas não conferem", path: ["confirm"] });

export async function signup(_: FormState, fd: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await withinRateLimit(`signup:${ip}`, 5, 3600))) return { error: "Muitas tentativas. Tente novamente mais tarde." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email, password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: `${h.get("origin") ?? `https://${h.get("host")}`}/auth/callback?next=/login` },
  });
  if (error && error.status !== 422 && !/registered/i.test(error.message)) return { error: "Não foi possível concluir o cadastro. Verifique os dados e tente de novo." };
  const { error: loginError } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (loginError) return { ok: "Cadastro criado! Se pedirmos confirmação, verifique seu e-mail e depois entre na aba \"Entrar\"." };
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
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
