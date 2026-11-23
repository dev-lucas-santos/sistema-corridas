"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { sendPushToUser } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { parseBRLToCents } from "@/lib/money";
import { fromLocalInput, formatDateTime } from "@/lib/dates";
import type { FormState } from "./auth";

const opt = (s: z.ZodString) => z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), s.nullable());
const dbError = (e: { code?: string; message: string }): FormState =>
  ({ error: e.code === "23505" ? "Já existe um registro com esses dados (ex.: CNPJ duplicado)." : e.code === "42501" ? "Você não tem permissão para esta ação." : e.message });

// ===== Clientes =====
const clientSchema = z.object({
  legal_name: z.string().trim().min(2, "Informe a razão social"),
  cnpj: opt(z.string().trim().regex(/^[\d./-]{14,18}$/, "CNPJ inválido")),
  contact_name: opt(z.string().trim()),
  email: opt(z.string().trim().email("E-mail inválido")),
  phone: opt(z.string().trim()),
  payment_terms: opt(z.string().trim()),
});

export async function saveClient(_: FormState, fd: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = clientSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const id = fd.get("id") as string | null;
  const supabase = await createClient();
  const { error } = id ? await supabase.from("clients").update(parsed.data).eq("id", id) : await supabase.from("clients").insert(parsed.data);
  if (error) return dbError(error);
  revalidatePath("/clientes");
  redirect("/clientes");
}

// ===== Motoristas (somente admin) =====
const driverSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome"),
  phone: opt(z.string().trim()),
  email: opt(z.string().trim().email("E-mail inválido")),
  cpf: opt(z.string().trim()),
  cnh_number: opt(z.string().trim()),
  cnh_expires_on: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  vehicle_plate: opt(z.string().trim().toUpperCase()),
  vehicle_model: opt(z.string().trim()),
  pix_key: opt(z.string().trim()),
  payout_type: z.enum(["percent", "fixed"]),
  payout_percent: z.coerce.number().min(0, "Percentual inválido").max(100, "Percentual inválido"),
  payout_fixed: z.string(),
});

export async function saveDriver(_: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = driverSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { payout_percent, payout_fixed, pix_key, payout_type, ...rest } = parsed.data;
  const settings = { pix_key, payout_type, payout_percent_bp: Math.round(payout_percent * 100), payout_fixed_cents: parseBRLToCents(payout_fixed) };
  const id = fd.get("id") as string | null;
  const supabase = await createClient();
  let driverId = id;
  if (id) {
    const { error } = await supabase.from("drivers").update(rest).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("drivers").insert(rest).select("id").single();
    if (error) return dbError(error);
    driverId = data.id;
  }
  const { error: e2 } = await supabase.from("driver_payout_settings").upsert({ driver_id: driverId, ...settings });
  if (e2) return dbError(e2);
  revalidatePath("/motoristas");
  redirect("/motoristas");
}

// ===== Corridas =====
const rideSchema = z.object({
  passenger_name: z.string().trim().min(2, "Informe o nome do passageiro"),
  passenger_phone: opt(z.string().trim()),
  origin: z.string().trim().min(3, "Informe a origem"),
  destination: z.string().trim().min(3, "Informe o destino"),
  scheduled_at: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Informe data e horário"),
  price: z.string(),
  payout: z.string(),
  client_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  driver_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  notes: opt(z.string().trim()),
  source: z.enum(["manual", "ai_paste", "whatsapp", "email"]).default("manual"),
  inbound_id: z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
  source_raw_message: opt(z.string().max(20_000)),
});

export async function saveRide(_: FormState, fd: FormData): Promise<FormState> {
  const profile = await requireStaff();
  const parsed = rideSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price, payout, driver_id, scheduled_at, inbound_id, ...rest } = parsed.data;
  const price_cents = parseBRLToCents(price);
  const driver_payout_cents = parseBRLToCents(payout);
  if (driver_payout_cents > price_cents) return { error: "O repasse ao motorista não pode ser maior que o valor da corrida." };
  const iso = fromLocalInput(scheduled_at);
  const id = fd.get("id") as string | null;
  const supabase = await createClient();

  const row = { ...rest, price_cents, driver_payout_cents, scheduled_at: iso };
  let rideId = id;
  if (id) {
    const editable: Partial<typeof row> = { ...row };
    delete editable.source;
    delete editable.source_raw_message;
    const { error } = await supabase.from("rides").update(editable).eq("id", id);
    if (error) return dbError(error);
  } else {
    const { data, error } = await supabase.from("rides").insert({ ...row, created_by: profile.id }).select("id").single();
    if (error) return dbError(error);
    rideId = data.id;
    if (inbound_id) {
      await supabase.from("inbound_messages").update({ status: "processed", ride_id: data.id, handled_by: profile.id }).eq("id", inbound_id);
      revalidatePath("/entrada");
    }
  }

  if (driver_id) {
    const { data: ride } = await supabase.from("rides").select("driver_id").eq("id", rideId!).single();
    if (ride?.driver_id !== driver_id) {
      const { error } = await supabase.rpc("assign_ride", { p_ride: rideId, p_driver: driver_id });
      if (error) return { error: error.message };
    }
  }
  revalidatePath("/corridas");
  redirect(`/corridas/${rideId}`);
}

export async function assignRide(_: FormState, fd: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = z.object({ ride_id: z.string().uuid(), driver_id: z.string().uuid("Escolha um motorista") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_ride", { p_ride: parsed.data.ride_id, p_driver: parsed.data.driver_id });
  if (error) return { error: error.message };
  const { data: drv } = await supabase.from("drivers").select("profile_id").eq("id", parsed.data.driver_id).single();
  const { data: ride } = await supabase.from("rides").select("origin, scheduled_at").eq("id", parsed.data.ride_id).single();
  if (drv?.profile_id && ride) {
    const userId = drv.profile_id;
    after(() => sendPushToUser(userId, {
      title: "Nova corrida",
      body: `${formatDateTime(ride.scheduled_at)} · ${ride.origin}`,
      url: "/motorista",
      tag: `ride-${parsed.data.ride_id}`,
    }));
  }
  revalidatePath(`/corridas/${parsed.data.ride_id}`);
  return { ok: "Corrida enviada ao motorista." };
}

export async function changeStatus(_: FormState, fd: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = z.object({
    ride_id: z.string().uuid(),
    to: z.enum(["pending", "scheduled", "confirmed", "in_progress", "completed", "cancelled"]),
    reason: opt(z.string().trim()),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("staff_set_ride_status", { p_ride: parsed.data.ride_id, p_to: parsed.data.to, p_reason: parsed.data.reason });
  if (error) return { error: error.message };
  revalidatePath(`/corridas/${parsed.data.ride_id}`);
  revalidatePath("/corridas");
  return { ok: "Status atualizado." };
}

// ===== Recorrentes =====
const recurringSchema = z.object({
  passenger_name: z.string().trim().min(2, "Informe o passageiro"),
  passenger_phone: opt(z.string().trim()),
  origin: z.string().trim().min(3, "Informe a origem"),
  destination: z.string().trim().min(3, "Informe o destino"),
  pickup_time: z.string().regex(/^\d{2}:\d{2}$/, "Informe o horário"),
  price: z.string(),
  payout: z.string(),
  client_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
  driver_id: z.preprocess((v) => (v === "" ? null : v), z.string().uuid().nullable()),
});

export async function saveRecurring(_: FormState, fd: FormData): Promise<FormState> {
  const profile = await requireStaff();
  const weekdays = fd.getAll("weekdays").map(Number).filter((n) => n >= 0 && n <= 6);
  if (weekdays.length === 0) return { error: "Escolha ao menos um dia da semana." };
  const parsed = recurringSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { price, payout, ...rest } = parsed.data;
  const price_cents = parseBRLToCents(price);
  const driver_payout_cents = parseBRLToCents(payout);
  if (driver_payout_cents > price_cents) return { error: "O repasse não pode ser maior que o valor da corrida." };
  const supabase = await createClient();
  const { error } = await supabase.from("recurring_rules").insert({ ...rest, weekdays, price_cents, driver_payout_cents, created_by: profile.id });
  if (error) return dbError(error);
  revalidatePath("/recorrentes");
  return { ok: "Regra criada. As corridas são geradas automaticamente todos os dias." };
}

export async function toggleRecurring(fd: FormData) {
  await requireStaff();
  const id = z.string().uuid().parse(fd.get("id"));
  const active = fd.get("active") === "true";
  const supabase = await createClient();
  await supabase.from("recurring_rules").update({ active: !active }).eq("id", id);
  revalidatePath("/recorrentes");
}

// ===== Disponibilidade =====
export async function setAvailability(fd: FormData) {
  await requireStaff();
  const p = z.object({ driver_id: z.string().uuid(), value: z.enum(["online", "busy", "offline"]) }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  await supabase.rpc("set_driver_availability", { p_driver: p.driver_id, p_value: p.value });
  revalidatePath("/motoristas");
  revalidatePath("/painel");
}
