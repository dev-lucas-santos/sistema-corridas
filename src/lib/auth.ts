import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = { id: string; full_name: string; email: string | null; role: "admin" | "operator" | "driver"; active: boolean };

// Só para testes locais: nunca vale em produção
export const BYPASS_AUTH = process.env.DEV_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production";

export const getProfile = cache(async (): Promise<Profile | null> => {
  if (BYPASS_AUTH) return { id: "00000000-0000-0000-0000-000000000001", full_name: "Admin (teste)", email: "teste@local", role: "admin", active: true };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("id, full_name, email, role, active").eq("id", uid).single();
  return (data as Profile) ?? null;
});

export async function requireStaff(): Promise<Profile> {
  const p = await getProfile();
  if (!p || !p.active) redirect("/login");
  if (p.role === "driver") redirect("/motorista");
  return p;
}

export async function requireAdmin(): Promise<Profile> {
  const p = await requireStaff();
  if (p.role !== "admin") redirect("/painel");
  return p;
}
