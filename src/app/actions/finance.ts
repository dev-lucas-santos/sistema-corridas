"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import { closingEnd } from "@/lib/finance/closing";
import type { FormState } from "./auth";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const reais = z.string().transform(parseBRLToCents).refine((v) => Number.isInteger(v) && v > 0, "Informe um valor maior que zero");

export async function createClosing(fd: FormData) {
  await requireAdmin();
  const p = z.object({
    driver_id: z.string().uuid(), period: z.enum(["weekly", "biweekly", "monthly"]), start: date,
  }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_closing", {
    p_driver: p.driver_id, p_period: p.period, p_start: p.start, p_end: closingEnd(p.period, p.start),
  });
  if (error) redirect(`/financeiro/novo?erro=${encodeURIComponent(error.message)}`);
  revalidatePath("/financeiro");
  redirect(`/financeiro/${data}`);
}

export async function addAdjustment(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({
    closing_id: z.string().uuid(), kind: z.enum(["discount", "addition"]), value: reais,
    reason: z.string().trim().min(3, "Informe a justificativa").max(300),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { closing_id, kind, value, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_adjustment", { p_closing: closing_id, p_amount: kind === "discount" ? -value : value, p_reason: reason });
  if (error) return { error: error.message };
  revalidatePath(`/financeiro/${closing_id}`);
  return { ok: "Ajuste lançado." };
}

export async function removeAdjustment(fd: FormData) {
  await requireAdmin();
  const p = z.object({ id: z.string().uuid(), closing_id: z.string().uuid() }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  await supabase.rpc("delete_adjustment", { p_id: p.id });
  revalidatePath(`/financeiro/${p.closing_id}`);
}

const MAX_RECEIPT = 5 * 1024 * 1024;
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function registerPayment(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = z.object({
    closing_id: z.string().uuid(), amount: reais, paid_at: date, note: z.string().trim().max(300).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { closing_id, amount, paid_at, note } = parsed.data;
  const supabase = await createClient();

  let path: string | null = null;
  const file = fd.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_RECEIPT) return { error: "Comprovante maior que 5 MB" };
    if (!RECEIPT_TYPES.includes(file.type)) return { error: "Comprovante deve ser imagem (JPG, PNG, WEBP) ou PDF" };
    const ext = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    path = `${closing_id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("receipts").upload(path, file, { contentType: file.type });
    if (up.error) return { error: "Não foi possível enviar o comprovante" };
  }

  const { error } = await supabase.rpc("register_closing_payment", {
    p_closing: closing_id, p_amount: amount, p_paid_at: new Date(`${paid_at}T12:00:00-03:00`).toISOString(), p_receipt: path, p_note: note ?? null,
  });
  if (error) {
    if (path) await supabase.storage.from("receipts").remove([path]);
    return { error: error.message };
  }
  revalidatePath(`/financeiro/${closing_id}`);
  revalidatePath("/financeiro");
  return { ok: "Pagamento registrado." };
}

export async function deleteClosing(fd: FormData) {
  await requireAdmin();
  const p = z.object({ id: z.string().uuid() }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_closing", { p_id: p.id });
  if (error) redirect(`/financeiro/${p.id}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath("/financeiro");
  redirect("/financeiro");
}
