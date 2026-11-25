import Link from "next/link";
import { redirect } from "next/navigation";
import { Pagination, StatusBadge } from "@/components/common";
import { getProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 20;

export default async function HistoricoMotorista({ searchParams }: PageProps<"/motorista/historico">) {
  const profile = await getProfile();
  if (!profile || !profile.active) redirect("/motorista/login");
  if (profile.role !== "driver") redirect("/motorista/login?conta=equipe");
  const sp = await searchParams;
  const status = sp.v === "cancelled" ? "cancelled" : "completed";
  const value = Number(sp.page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  const supabase = await createClient();
  const { data: driver, error: driverError } = await supabase.from("drivers").select("id, active").eq("profile_id", profile.id).maybeSingle();
  if (driverError) return <main className="mx-auto max-w-md p-4"><p role="alert" className="card text-red-600">Não foi possível carregar seu cadastro.</p></main>;
  if (!driver?.active) return <main className="mx-auto max-w-md p-4"><p className="card">Seu acesso não está vinculado a um motorista ativo.</p></main>;
  const { data, error, count } = await supabase.from("rides")
    .select("id, code, passenger_name, origin, destination, scheduled_at, driver_payout_cents, status, cancelled_reason", { count: "exact" })
    .eq("driver_id", driver.id).eq("status", status).order("scheduled_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const ids = (data ?? []).map((ride) => ride.id);
  const assignments = ids.length ? await supabase.from("ride_assignments").select("id, ride_id")
    .eq("driver_id", driver.id).in("ride_id", ids).order("sent_at", { ascending: false }) : { data: [], error: null };
  const conversations = new Map<string, string>();
  for (const assignment of assignments.data ?? []) {
    if (!conversations.has(assignment.ride_id)) conversations.set(assignment.ride_id, assignment.id);
  }
  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-16">
      <header className="flex items-center justify-between"><h1 className="text-xl font-bold">Histórico de corridas</h1><Link href="/motorista" className="btn-secondary">Voltar</Link></header>
      <nav className="grid grid-cols-2 gap-2" aria-label="Filtrar histórico">
        <Link className={status === "completed" ? "btn-primary" : "btn-secondary"} href="/motorista/historico?v=completed">Realizadas</Link>
        <Link className={status === "cancelled" ? "btn-primary" : "btn-secondary"} href="/motorista/historico?v=cancelled">Canceladas</Link>
      </nav>
      {error || assignments.error ? <p role="alert" className="card text-red-600">Não foi possível carregar o histórico completo. Tente novamente.</p> :
        <ul className="space-y-3">
          {data?.map((ride) => (
            <li key={ride.id} className="card space-y-2 text-sm">
              <div className="flex justify-between gap-2"><b>Corrida #{ride.code} · {ride.passenger_name}</b><StatusBadge status={ride.status} /></div>
              <p>{formatDateTime(ride.scheduled_at)}</p>
              <p><b>Origem:</b> {ride.origin}</p><p><b>Destino:</b> {ride.destination}</p>
              {status === "completed" && <p><b>Repasse:</b> {formatBRL(ride.driver_payout_cents)}</p>}
              {ride.cancelled_reason && <p><b>Motivo:</b> {ride.cancelled_reason}</p>}
              {conversations.get(ride.id) && <Link className="btn-secondary w-full" href={`/motorista/mensagens/${conversations.get(ride.id)}`}>Mensagens com a base</Link>}
            </li>
          ))}
          {!data?.length && <li className="card text-slate-500">Nenhuma corrida nesta categoria.</li>}
        </ul>}
      {!error && <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/motorista/historico" params={{ v: status }} />}
    </main>
  );
}
