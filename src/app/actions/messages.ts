"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import type { FormState } from "@/app/actions/auth";
import { getProfile } from "@/lib/auth";
import { sendPushToUser } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";

export async function sendRideMessage(_: FormState, fd: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile || !profile.active) return { error: "Sua sessão não permite enviar mensagens." };
  const parsed = z.object({
    assignment_id: z.string().uuid(),
    body: z.string().trim().min(1, "Digite uma mensagem.").max(2000, "A mensagem deve ter no máximo 2.000 caracteres."),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: assignment, error: lookupError } = await supabase.from("ride_assignments")
    .select("id, ride_id, driver_id").eq("id", parsed.data.assignment_id).maybeSingle();
  if (lookupError) return { error: "Não foi possível verificar a conversa. Tente novamente." };
  if (!assignment) return { error: "Conversa não encontrada ou sem permissão." };
  const { error } = await supabase.from("ride_messages").insert({
    assignment_id: assignment.id, sender_id: profile.id, body: parsed.data.body,
  });
  if (error) return { error: "Não foi possível enviar a mensagem. Tente novamente." };
  if (profile.role !== "driver") {
    const { data: driver, error: driverError } = await supabase.from("drivers").select("profile_id")
      .eq("id", assignment.driver_id).maybeSingle();
    if (driverError) console.error("Não foi possível preparar a notificação da mensagem", driverError.message);
    if (driver?.profile_id) {
      const userId = driver.profile_id;
      after(() => sendPushToUser(userId, {
        title: "Mensagem da base",
        body: "Você recebeu uma mensagem sobre uma corrida.",
        url: `/motorista/mensagens/${assignment.id}`,
        tag: `message-${assignment.id}`,
      }));
    }

  }
  revalidatePath(`/motorista/mensagens/${assignment.id}`);
  revalidatePath(`/mensagens/${assignment.id}`);
  revalidatePath("/mensagens");
  return { ok: "Mensagem enviada." };
}

export async function sendGeneralMessage(_: FormState, fd: FormData): Promise<FormState> {
  const profile = await getProfile();
  if (!profile || !profile.active) return { error: "Sua sessão não permite enviar mensagens." };
  const parsed = z.object({
    driver_profile_id: z.string().uuid(),
    body: z.string().trim().min(1, "Digite uma mensagem.").max(2000, "A mensagem deve ter no máximo 2.000 caracteres."),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (profile.role === "driver" && parsed.data.driver_profile_id !== profile.id) return { error: "Conversa não encontrada ou sem permissão." };
  const { error } = await (await createClient()).from("driver_general_messages").insert({
    driver_profile_id: parsed.data.driver_profile_id, sender_id: profile.id, body: parsed.data.body,
  });
  if (error) {
    console.error("Não foi possível enviar a mensagem geral", error.code);
    return { error: "Não foi possível enviar a mensagem. Verifique seu acesso ou tente novamente." };
  }
  if (profile.role !== "driver") {
    const userId = parsed.data.driver_profile_id;
    after(() => sendPushToUser(userId, {
      title: "Mensagem da base",
      body: "Você recebeu uma mensagem da base.",
      url: "/motorista/mensagens",
      tag: "general-message",
    }));
  }
  revalidatePath("/motorista/mensagens");
  revalidatePath(`/mensagens/geral/${parsed.data.driver_profile_id}`);
  revalidatePath("/mensagens");
  return { ok: "Mensagem enviada." };
}
