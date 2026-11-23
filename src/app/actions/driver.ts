"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

async function requireDriver() {
  const p = await getProfile();
  if (!p || !p.active || p.role !== "driver") throw new Error("Sem permissão");
  return p;
}

export async function respondAssignment(fd: FormData) {
  await requireDriver();
  const p = z.object({
    assignment_id: z.string().uuid(),
    accept: z.enum(["true", "false"]),
    reason: z.string().trim().max(300).optional(),
  }).parse(Object.fromEntries(fd));
  const accept = p.accept === "true";
  if (!accept && !p.reason) return;
  const supabase = await createClient();
  await supabase.rpc("respond_assignment", { p_assignment: p.assignment_id, p_accept: accept, p_reason: accept ? null : p.reason });
  revalidatePath("/motorista");
}

export async function driverRideStatus(fd: FormData) {
  await requireDriver();
  const p = z.object({ ride_id: z.string().uuid(), to: z.enum(["in_progress", "completed"]) }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  await supabase.rpc("driver_set_ride_status", { p_ride: p.ride_id, p_to: p.to });
  revalidatePath("/motorista");
}

export async function setMyAvailability(fd: FormData) {
  await requireDriver();
  const p = z.object({ value: z.enum(["online", "busy", "offline"]) }).parse(Object.fromEntries(fd));
  const supabase = await createClient();
  const { data: id } = await supabase.rpc("my_driver_id");
  if (id) await supabase.rpc("set_driver_availability", { p_driver: id, p_value: p.value });
  revalidatePath("/motorista");
}
