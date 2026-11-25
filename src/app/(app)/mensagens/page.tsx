import Link from "next/link";
import { PageHeader, Pagination } from "@/components/common";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const TABLES = ["ride_messages", "driver_general_messages"];
const PAGE_SIZE = 20;

export default async function Mensagens({ searchParams }: PageProps<"/mensagens">) {
  await requireStaff();
  const search = await searchParams;
  const value = Number(search.page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  const generalValue = Number(search.geral);
  const generalPage = Number.isSafeInteger(generalValue) && generalValue > 0 ? generalValue : 1;
  const supabase = await createClient();
  const [{ data, error, count }, general] = await Promise.all([
    supabase.from("ride_message_threads").select("*", { count: "exact" }).order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("driver_general_threads").select("*", { count: "exact" }).order("created_at", { ascending: false })
      .range((generalPage - 1) * PAGE_SIZE, generalPage * PAGE_SIZE - 1),
  ]);
  return (
    <>
      <RealtimeRefresh tables={TABLES} poll={15000} />
      <PageHeader title="Mensagens dos motoristas" />
      <h2 className="mb-3 font-semibold">Conversas gerais</h2>
      {general.error ? <p role="alert" className="card text-red-600">Não foi possível carregar as conversas gerais. Verifique a configuração do banco.</p> :
        <ul className="mb-6 space-y-3">
          {general.data?.map((thread) => (
            <li key={thread.driver_profile_id}>
              <Link href={`/mensagens/geral/${thread.driver_profile_id}`} className="card block hover:border-blue-400">
                <div className="flex flex-wrap justify-between gap-2"><b>{thread.driver_name}</b><span className="text-sm text-slate-500">{formatDateTime(thread.created_at)}</span></div>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm">{thread.body}</p>
              </Link>
            </li>
          ))}
          {!general.data?.length && <li className="card text-slate-500">Nenhuma conversa geral ainda.</li>}
        </ul>}
      {!general.error && <Pagination page={generalPage} pageSize={PAGE_SIZE} total={general.count ?? 0} basePath="/mensagens" pageParam="geral" params={{ page: String(page) }} />}
      <h2 className="mb-3 mt-6 font-semibold">Conversas por corrida</h2>
      {error ? <p role="alert" className="card text-red-600">Não foi possível carregar as conversas. Verifique a configuração do banco.</p> :
        <ul className="space-y-3">
          {data?.map((thread) => (
            <li key={thread.assignment_id}>
              <Link href={`/mensagens/${thread.assignment_id}`} className="card block hover:border-blue-400">
                <div className="flex flex-wrap justify-between gap-2"><b>{thread.driver_name} · Corrida #{thread.code}</b><span className="text-sm text-slate-500">{formatDateTime(thread.created_at)}</span></div>
                <p className="text-sm text-slate-500">{thread.passenger_name}</p>
                <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm">{thread.body}</p>
              </Link>
            </li>
          ))}
          {!data?.length && <li className="card text-slate-500">Nenhuma conversa ainda. Abra uma corrida enviada para iniciar uma conversa.</li>}
        </ul>}
      {!error && <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/mensagens" params={{ geral: String(generalPage) }} />}
    </>
  );
}
