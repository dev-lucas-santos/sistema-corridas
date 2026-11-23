import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge } from "@/components/common";
import { loadOptions } from "@/lib/options";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { ASSIGNMENT_STATUS } from "@/lib/labels";
import { AssignPanel, StatusPanel } from "./panels";

export default async function CorridaDetalhe({ params }: PageProps<"/corridas/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: r }, { data: history }, { data: assigns }, { drivers }] = await Promise.all([
    supabase.from("rides").select("*, clients(legal_name), drivers(full_name)").eq("id", id).maybeSingle(),
    supabase.from("ride_status_history").select("id, from_status, to_status, changed_at, note, profiles:changed_by(full_name)").eq("ride_id", id).order("changed_at"),
    supabase.from("ride_assignments").select("id, status, sent_at, responded_at, decline_reason, drivers(full_name)").eq("ride_id", id).order("sent_at", { ascending: false }),
    loadOptions(),
  ]);
  if (!r) notFound();
  const client = r.clients as { legal_name: string } | null;
  const driver = r.drivers as { full_name: string } | null;
  const row = (k: string, v: React.ReactNode) => (<div><dt className="text-xs uppercase text-slate-500">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>);

  return (
    <>
      <PageHeader title={`Corrida #${r.code}`}>
        <StatusBadge status={r.status} />
        {r.status !== "completed" && r.status !== "cancelled" && <Link href={`/corridas/${r.id}/editar`} className="btn-secondary">Editar</Link>}
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card lg:col-span-2">
          <dl className="grid gap-4 sm:grid-cols-2">
            {row("Passageiro", r.passenger_name)}
            {row("Telefone", r.passenger_phone)}
            {row("Origem", r.origin)}
            {row("Destino", r.destination)}
            {row("Data e horário", formatDateTime(r.scheduled_at))}
            {row("Cliente", client?.legal_name)}
            {row("Valor da corrida", formatBRL(r.price_cents))}
            {row("Repasse ao motorista", formatBRL(r.driver_payout_cents))}
            {row("Margem da base", formatBRL(r.price_cents - r.driver_payout_cents))}
            {row("Motorista", driver?.full_name)}
            {row("Observações", r.notes)}
            {r.cancelled_reason && row("Motivo do cancelamento", r.cancelled_reason)}
          </dl>
        </section>
        <div className="space-y-4">
          {r.status !== "completed" && r.status !== "cancelled" && (
            <section className="card"><h2 className="mb-3 font-semibold">Motorista</h2><AssignPanel rideId={r.id} drivers={drivers} current={r.driver_id} /></section>
          )}
          <section className="card"><h2 className="mb-3 font-semibold">Status</h2><StatusPanel rideId={r.id} status={r.status} /></section>
        </div>
        <section className="card">
          <h2 className="mb-3 font-semibold">Histórico de status</h2>
          <ul className="space-y-2 text-sm">
            {history?.map((h) => (
              <li key={h.id}>
                <StatusBadge status={h.to_status} /> <span className="text-slate-500">{formatDateTime(h.changed_at)} · {(h.profiles as unknown as { full_name: string } | null)?.full_name ?? "sistema"}</span>
                {h.note && <div className="text-slate-500">{h.note}</div>}
              </li>
            ))}
          </ul>
        </section>
        <section className="card lg:col-span-2">
          <h2 className="mb-3 font-semibold">Envios ao motorista</h2>
          <ul className="space-y-2 text-sm">
            {assigns?.map((a) => (
              <li key={a.id}>
                <b>{(a.drivers as unknown as { full_name: string })?.full_name}</b> — {ASSIGNMENT_STATUS[a.status]} · enviada {formatDateTime(a.sent_at)}
                {a.responded_at && ` · respondida ${formatDateTime(a.responded_at)}`}
                {a.decline_reason && <span className="text-red-600"> · motivo: {a.decline_reason}</span>}
              </li>
            ))}
            {!assigns?.length && <li className="text-slate-500">Nenhum envio ainda.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
