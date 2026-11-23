"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { dueRange, rangeFor, type Frequency } from "@/lib/reports/period";
import { todayBR } from "@/lib/dates";
import type { FormState } from "./auth";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export async function createSchedule(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({
    name: z.string().trim().min(2, "Informe um nome").max(80),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    send_hour: z.coerce.number().int().min(0).max(23),
    recipients: z.string().transform((s) => s.split(/[,;\s]+/).filter(Boolean)).pipe(z.array(z.string().email("E-mail inválido")).min(1, "Informe ao menos um e-mail").max(20)),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.from("report_schedules").insert(parsed.data);
  if (error) return { error: error.message };
  revalidatePath("/relatorios");
  return { ok: "Envio agendado." };
}

export async function deleteSchedule(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("id"));
  await (await createClient()).from("report_schedules").delete().eq("id", id);
  revalidatePath("/relatorios");
}

export async function toggleSchedule(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("id"));
  const active = fd.get("active") === "true";
  await (await createClient()).from("report_schedules").update({ active: !active }).eq("id", id);
  revalidatePath("/relatorios");
}

// Enfileira o envio do período mais recente já encerrado; o processamento ocorre em segundo plano.
export async function sendScheduleNow(fd: FormData) {
  await requireAdmin();
  const id = z.string().uuid().parse(fd.get("id"));
  const supabase = await createClient();
  const { data: s } = await supabase.from("report_schedules").select("frequency").eq("id", id).single();
  if (!s) redirect("/relatorios?erro=Agendamento não encontrado");
  const freq = s.frequency as Frequency;
  const today = todayBR();
  const range = dueRange(freq, today) ?? rangeFor(freq, today);
  const { error } = await supabase.from("jobs").insert({ type: "report_email", payload: { schedule_id: id, ...range } });
  redirect(error ? `/relatorios?erro=${encodeURIComponent(error.message)}` : "/relatorios?ok=Envio na fila. O e-mail chega em poucos minutos.");
}

export async function syncSheets(fd: FormData) {
  await requireAdmin();
  const p = z.object({ from: date, to: date }).safeParse(Object.fromEntries(fd));
  if (!p.success) redirect("/relatorios?erro=Período inválido");
  const { data, error } = await (await createClient()).rpc("enqueue_sheets_backfill", { p_start: p.data.from, p_end: p.data.to });
  redirect(error ? `/relatorios?erro=${encodeURIComponent(error.message)}` : `/relatorios?ok=${data} corrida(s) na fila para o Google Sheets.`);
}
