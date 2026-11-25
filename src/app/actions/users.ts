"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const schema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "operator"]).optional(),
  active: z.enum(["true", "false"]),
});

export async function updateUser(_: FormState, fd: FormData): Promise<FormState> {
  const me = await requireAdmin();
  const parsed = schema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: "Dados do usuário inválidos." };
  const p = parsed.data;
  if (p.id === me.id) return { error: "Você não pode alterar seu próprio acesso." };
  const active = p.active === "true";
  const patch: { active: boolean; role?: "admin" | "operator" } = { active };
  if (p.role) patch.role = p.role;
  const { data, error } = await (await createClient()).from("profiles").update(patch)
    .eq("id", p.id).neq("role", "driver").eq("active", !active).select("id").maybeSingle();
  if (error) {
    console.error("Falha ao atualizar acesso do usuário", error.code);
    return { error: "Não foi possível atualizar o acesso. Tente novamente." };
  }
  if (!data) return { error: "O usuário não foi encontrado ou seu acesso já foi alterado. Atualize a página." };
  revalidatePath("/usuarios");
  revalidatePath("/administrador");
  return { ok: active ? "Acesso aprovado." : "Acesso desativado." };
}
