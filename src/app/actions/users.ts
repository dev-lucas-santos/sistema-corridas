"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  id: z.string().uuid(),
  role: z.enum(["admin", "operator"]).optional(),
  active: z.enum(["true", "false"]),
});

export async function updateUser(fd: FormData) {
  await requireAdmin();
  const p = schema.parse(Object.fromEntries(fd));
  const patch: { active: boolean; role?: "admin" | "operator" } = { active: p.active === "true" };
  if (p.role) patch.role = p.role;
  // O banco bloqueia o admin de alterar o próprio papel/status
  await (await createClient()).from("profiles").update(patch).eq("id", p.id).neq("role", "driver");
  revalidatePath("/usuarios");
}
