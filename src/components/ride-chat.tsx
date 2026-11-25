import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Pagination } from "@/components/common";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { sendRideMessage } from "@/app/actions/messages";
import type { Profile } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const TABLES = ["ride_messages"];
const PAGE_SIZE = 50;

export async function RideChat({ id, profile, page }: { id: string; profile: Profile; page: number }) {
  const supabase = await createClient();
  const { data: assignment, error: assignmentError } = await supabase.from("ride_assignments")
    .select("id, ride_id").eq("id", id).maybeSingle();
  if (assignmentError) return <p role="alert" className="card text-red-600">Não foi possível carregar a conversa.</p>;
  if (!assignment) notFound();
  const { data: messages, error, count } = await supabase.from("ride_messages")
    .select("id, sender_id, body, created_at", { count: "exact" })
    .eq("assignment_id", id).order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const basePath = profile.role === "driver" ? `/motorista/mensagens/${id}` : `/mensagens/${id}`;
  if (error) return <p role="alert" className="card text-red-600">Não foi possível carregar as mensagens. Verifique a configuração do banco.</p>;
  const senderIds = [...new Set((messages ?? []).map((m) => m.sender_id))];
  const { data: senders, error: senderError } = senderIds.length
    ? await supabase.from("profiles").select("id, full_name, role").in("id", senderIds)
    : { data: [], error: null };
  if (senderError) return <p role="alert" className="card text-red-600">Não foi possível identificar os participantes.</p>;
  const names = new Map((senders ?? []).map((sender) => [sender.id, sender]));
  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={TABLES} poll={15000} />
      <Link href={profile.role === "driver" ? "/motorista" : `/corridas/${assignment.ride_id}`} className="btn-secondary">Voltar</Link>
      <h1 className="text-xl font-bold">Mensagens da corrida</h1>
      <p className="text-sm text-slate-500">A conversa é compartilhada com a equipe da base.</p>
      <ol className="space-y-3">
        {[...(messages ?? [])].reverse().map((m) => {
          const sender = names.get(m.sender_id);
          const label = m.sender_id === profile.id ? "Você" : profile.role === "driver" ? "Base" : sender?.full_name || "Participante";
          return (
            <li key={m.id} className={`rounded-xl p-3 text-sm ${m.sender_id === profile.id ? "ml-8 bg-blue-100 dark:bg-blue-950" : "mr-8 bg-slate-100 dark:bg-slate-800"}`}>
              <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500"><b>{label}</b><span>{formatDateTime(m.created_at)}</span></div>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          );
        })}
        {!messages?.length && <li className="card text-sm text-slate-500">Nenhuma mensagem nesta conversa.</li>}
      </ol>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath={basePath} params={{}} />
      <ActionForm action={sendRideMessage} submitLabel="Enviar mensagem">
        <input type="hidden" name="assignment_id" value={id} />
        <label className="label" htmlFor="body">Sua mensagem</label>
        <textarea id="body" name="body" required maxLength={2000} rows={3} className="input" />
      </ActionForm>
    </div>
  );
}
