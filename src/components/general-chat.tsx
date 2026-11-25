import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Pagination } from "@/components/common";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { sendGeneralMessage } from "@/app/actions/messages";
import type { Profile } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const TABLES = ["driver_general_messages"];
const PAGE_SIZE = 50;

export async function GeneralChat({ profile, driverId, driverName, page }: {
  profile: Profile; driverId: string; driverName?: string; page: number;
}) {
  const { data, error, count } = await (await createClient()).from("driver_general_messages")
    .select("id, sender_id, body, created_at", { count: "exact" })
    .eq("driver_profile_id", driverId).order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const isDriver = profile.role === "driver";
  const basePath = isDriver ? "/motorista/mensagens" : `/mensagens/geral/${driverId}`;
  if (error) return <p role="alert" className="card text-red-600">Não foi possível carregar as mensagens. Tente novamente ou contate a base.</p>;
  return (
    <div className="space-y-4">
      <RealtimeRefresh tables={TABLES} poll={15000} />
      <Link href={isDriver ? "/motorista" : "/mensagens"} className="btn-secondary">Voltar</Link>
      <h1 className="text-xl font-bold">{isDriver ? "Mensagens com a base" : `Conversa geral · ${driverName}`}</h1>
      <p className="text-sm text-slate-500">Esta conversa é compartilhada com a equipe da base.</p>
      <ol className="space-y-3">
        {[...(data ?? [])].reverse().map((message) => (
          <li key={message.id} className={`rounded-xl p-3 text-sm ${message.sender_id === profile.id ? "ml-8 bg-blue-100 dark:bg-blue-950" : "mr-8 bg-slate-100 dark:bg-slate-800"}`}>
            <div className="mb-1 flex justify-between gap-2 text-xs text-slate-500">
              <b>{message.sender_id === profile.id ? "Você" : message.sender_id === driverId ? driverName || "Motorista" : "Base"}</b>
              <span>{formatDateTime(message.created_at)}</span>
            </div>
            <p className="whitespace-pre-wrap break-words">{message.body}</p>
          </li>
        ))}
        {!data?.length && <li className="card text-sm text-slate-500">Nenhuma mensagem nesta conversa.</li>}
      </ol>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath={basePath} params={{}} />
      <ActionForm action={sendGeneralMessage} submitLabel="Enviar mensagem">
        <input type="hidden" name="driver_profile_id" value={driverId} />
        <label className="label" htmlFor="body">Sua mensagem</label>
        <textarea id="body" name="body" required maxLength={2000} rows={3} className="input" />
      </ActionForm>
    </div>
  );
}
