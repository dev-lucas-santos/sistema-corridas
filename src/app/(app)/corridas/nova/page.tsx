import { PageHeader } from "@/components/common";
import { requireStaff } from "@/lib/auth";
import type { Extracted } from "@/lib/ai/extract";
import { loadOptions } from "@/lib/options";
import { createClient } from "@/lib/supabase/server";
import { RideForm } from "../ride-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovaCorrida({ searchParams }: PageProps<"/corridas/nova">) {
  await requireStaff();
  const { clients, drivers } = await loadOptions();
  const from = (await searchParams).from;
  let msg: { id: string; channel: "whatsapp" | "email"; body: string; subject: string | null; extracted: Extracted | null } | null = null;
  if (typeof from === "string" && UUID.test(from)) {
    const { data } = await (await createClient()).from("inbound_messages").select("id, channel, body, subject, extracted").eq("id", from).in("status", ["received", "ready", "failed"]).maybeSingle();
    msg = data;
  }
  return (
    <>
      <PageHeader title="Nova corrida" />
      {msg && (
        <div className="card mb-4 max-w-3xl">
          <div className="label">Mensagem recebida ({msg.channel === "whatsapp" ? "WhatsApp" : "e-mail"})</div>
          <p className="whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{msg.subject ? `${msg.subject}\n\n` : ""}{msg.body.slice(0, 1500)}</p>
        </div>
      )}
      <RideForm clients={clients} drivers={drivers} initial={msg?.extracted ?? undefined} inboundId={msg?.id} source={msg?.channel}
        rawMessage={msg ? [msg.subject, msg.body].filter(Boolean).join("\n\n") : undefined} />
    </>
  );
}
