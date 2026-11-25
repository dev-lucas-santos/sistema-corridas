import Link from "next/link";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatusBadge, AvailabilityBadge } from "@/components/common";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { hasAdminAccess } from "@/lib/auth";
import { RIDE_STATUS } from "@/lib/labels";

type Stats = {
  today_by_status: Record<string, number>; drivers_online: number; drivers_busy: number;
  revenue_day: number; revenue_month: number; payout_month: number; pending_no_driver: number; payable_cents: number;
};

export default async function Painel() {
  const adminAccess = await hasAdminAccess();
  const supabase = await createClient();
  // Cache de 30s por perfil: o RLS torna o resultado igual para todos do mesmo papel
  const stats = await unstable_cache(async () => (await supabase.rpc("dashboard_stats")).data, ["dashboard_stats", adminAccess ? "admin" : "staff"], { revalidate: 30 })();
  const [{ data: pending }, { data: drivers }] = await Promise.all([
    supabase.from("rides").select("id, code, passenger_name, origin, scheduled_at").eq("status", "pending").is("driver_id", null).order("scheduled_at").limit(10),
    supabase.from("drivers").select("id, full_name, availability").eq("active", true).neq("availability", "offline").order("full_name").limit(20),
  ]);
  const s = (stats ?? { today_by_status: {}, drivers_online: 0, drivers_busy: 0, revenue_day: 0, revenue_month: 0, payout_month: 0, pending_no_driver: 0, payable_cents: 0 }) as Stats;
  const card = (title: string, value: React.ReactNode, tone = "") => (
    <div className="card"><div className="text-sm text-slate-500">{title}</div><div className={`text-2xl font-bold ${tone}`}>{value}</div></div>
  );

  return (
    <>
      <PageHeader title="Painel"><Link href="/corridas/nova" className="btn-primary">+ Nova corrida</Link></PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {card("Pendentes sem motorista", s.pending_no_driver, s.pending_no_driver > 0 ? "text-amber-600" : "")}
        {card("Motoristas online / ocupados", `${s.drivers_online} / ${s.drivers_busy}`)}
        {card("Faturado hoje", formatBRL(s.revenue_day))}
        {card("Faturado no mês", formatBRL(s.revenue_month))}
        {card("A pagar aos motoristas (mês)", formatBRL(s.payout_month))}
        {card("Margem da base (mês)", formatBRL(s.revenue_month - s.payout_month), "text-green-600")}
        {adminAccess && card("Em aberto a pagar (total)", formatBRL(s.payable_cents), "text-amber-600")}
      </div>
      <h2 className="mb-2 mt-6 font-semibold">Corridas de hoje por status</h2>
      <div className="flex flex-wrap gap-3">
        {Object.keys(RIDE_STATUS).map((k) => (
          <Link key={k} href={`/corridas?status=${k}`} className="card flex items-center gap-3 py-3">
            <StatusBadge status={k} /><span className="text-xl font-bold">{s.today_by_status[k] ?? 0}</span>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Aguardando motorista</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pending?.map((r) => (
              <li key={r.id} className="py-2"><Link href={`/corridas/${r.id}`} className="font-medium text-blue-600 hover:underline">#{r.code} {r.passenger_name}</Link>
                <div className="text-sm text-slate-500">{formatDateTime(r.scheduled_at)} · {r.origin}</div></li>
            ))}
            {!pending?.length && <li className="py-2 text-slate-500">Tudo atribuído 🎉</li>}
          </ul>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Motoristas agora</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {drivers?.map((d) => (<li key={d.id} className="flex items-center justify-between py-2"><span>{d.full_name}</span><AvailabilityBadge value={d.availability} /></li>))}
            {!drivers?.length && <li className="py-2 text-slate-500">Nenhum motorista online.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
