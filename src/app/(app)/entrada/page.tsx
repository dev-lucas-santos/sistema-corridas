import Link from "next/link";
import { ignoreInbound } from "@/app/actions/inbound";
import { PageHeader, Pagination } from "@/components/common";
import { requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;
const STATUS: Record<string, string> = { received: "Lendo…", ready: "Pronta", failed: "Leitura falhou", processed: "Corrida criada", ignored: "Ignorada" };
const FILTERS = [["open", "Pendentes"], ["processed", "Com corrida"], ["ignored", "Ignoradas"]] as const;

export default async function Entrada({ searchParams }: PageProps<"/entrada">) {
  await requireStaff();
  const sp = await searchParams;
  const view = FILTERS.some(([k]) => k === sp.v) ? (sp.v as string) : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  let q = (await createClient()).from("inbound_messages")
    .select("id, channel, sender, sender_name, subject, body, status, extracted, ride_id, received_at", { count: "exact" })
    .order("received_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  q = view === "open" ? q.in("status", ["received", "ready", "failed"]) : q.eq("status", view);
  const { data, count } = await q;

  return (
    <>
      <PageHeader title="Caixa de entrada">
        {FILTERS.map(([k, l]) => <Link key={k} href={`/entrada?v=${k}`} className={view === k ? "btn-primary" : "btn-secondary"}>{l}</Link>)}
      </PageHeader>
      <p className="mb-4 text-slate-500">Pedidos recebidos por WhatsApp e e-mail. Confira os dados lidos pela IA e crie a corrida.</p>
      <ul className="space-y-3">
        {data?.map((m) => {
          const x = m.extracted as { passenger_name?: string; origin?: string; destination?: string; scheduled_at_local?: string } | null;
          return (
            <li key={m.id} className="card space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">{m.channel === "whatsapp" ? "WhatsApp" : "E-mail"} · {m.sender_name ?? m.sender ?? "desconhecido"}</span>
                <span className="text-slate-500">{formatDateTime(m.received_at)} · {STATUS[m.status]}</span>
              </div>
              {m.subject && <div className="font-medium">{m.subject}</div>}
              <p className="line-clamp-4 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{m.body}</p>
              {x && (x.passenger_name || x.origin) && (
                <div className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-800">
                  {x.passenger_name} · {x.origin} → {x.destination} · {x.scheduled_at_local?.replace("T", " ")}
                </div>
              )}
              <div className="flex gap-2">
                {m.ride_id ? <Link className="btn-secondary" href={`/corridas/${m.ride_id}`}>Ver corrida</Link> : m.status !== "ignored" && (
                  <>
                    <Link className="btn-primary" href={`/corridas/nova?from=${m.id}`}>Criar corrida</Link>
                    <form action={ignoreInbound}><input type="hidden" name="id" value={m.id} /><button className="btn-secondary">Ignorar</button></form>
                  </>
                )}
              </div>
            </li>
          );
        })}
        {!data?.length && <li className="card text-slate-500">Nenhuma mensagem.</li>}
      </ul>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/entrada" params={{ v: view }} />
    </>
  );
}
