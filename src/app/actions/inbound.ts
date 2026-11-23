"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { aiConfigured, extractRide, MAX_TEXT, type Extracted } from "@/lib/ai/extract";
import { todayBR } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export type ExtractResult = { ok: true; data: Extracted } | { ok: false; error: string };

export async function extractFromText(text: string): Promise<ExtractResult> {
  await requireStaff();
  const parsed = z.string().trim().min(10, "Cole a mensagem completa").max(MAX_TEXT, "Mensagem muito longa").safeParse(text);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (!aiConfigured()) return { ok: false, error: "A leitura por IA ainda não está configurada (OPENAI_API_KEY). Preencha manualmente." };
  try {
    return { ok: true, data: await extractRide(parsed.data, todayBR()) };
  } catch {
    return { ok: false, error: "Não foi possível ler a mensagem agora. Preencha manualmente." };
  }
}

export async function ignoreInbound(fd: FormData) {
  const profile = await requireStaff();
  const id = z.string().uuid().parse(fd.get("id"));
  const supabase = await createClient();
  await supabase.from("inbound_messages").update({ status: "ignored", handled_by: profile.id }).eq("id", id).in("status", ["received", "ready", "failed"]);
  revalidatePath("/entrada");
}
