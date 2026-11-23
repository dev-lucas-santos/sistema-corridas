"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const schema = z.object({ timeout: z.coerce.number().int("Use um número inteiro").min(1, "Mínimo 1 minuto").max(240, "Máximo 240 minutos") });

export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = schema.safeParse({ timeout: fd.get("timeout") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { error } = await (await createClient()).from("settings")
    .upsert({ key: "driver_response_timeout_minutes", value: parsed.data.timeout, updated_at: new Date().toISOString() });
  if (error) return { error: "Não foi possível salvar." };
  revalidatePath("/configuracoes");
  return { ok: "Configurações salvas." };
}
