import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, MessageCircle, Navigation, MapPin } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { driverLogout, respondAssignment, driverRideStatus, setMyAvailability } from "@/app/actions/driver";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { AVAILABILITY } from "@/lib/labels";
import { Pagination, StatusBadge } from "@/components/common";
import { PushToggle } from "@/components/push-toggle";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { DriverRouteMap } from "@/components/driver-route-map";

type Ride = {
  id: string; passenger_name: string; passenger_phone: string | null; origin: string; destination: string;
  scheduled_at: string; driver_payout_cents: number | null; notes: string | null; status: string;
};
const RIDE_COLS = "id, passenger_name, passenger_phone, origin, destination, scheduled_at, driver_payout_cents, notes, status";
const RT_TABLES = ["rides", "ride_assignments", "ride_messages"];
const PAGE_SIZE = 20;

function waNumber(s: string) { const d = s.replace(/\D/g, ""); return d.length <= 11 ? `55${d}` : d; }

function RideInfo({ r, full }: { r: Ride; full: boolean }) {
  const q = encodeURIComponent(r.destination);
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{r.passenger_name}</p>
          <p className="text-sm text-slate-500">{formatDateTime(r.scheduled_at)}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{formatBRL(r.driver_payout_cents)}</p>
          <StatusBadge status={r.status} />
        </div>
      </div>
      <p className="flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 shrink-0 text-green-600" /><span><b>Origem:</b> {r.origin}</span></p>
      <p className="flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 shrink-0 text-red-600" /><span><b>Destino:</b> {r.destination}</span></p>
      {r.notes && <p className="rounded-lg bg-amber-50 p-2 text-sm dark:bg-amber-950">{r.notes}</p>}
      {full && (
        <div className="grid grid-cols-2 gap-2">
          {r.passenger_phone && (
            <>
              <a className="btn-secondary" href={`tel:+${waNumber(r.passenger_phone)}`}><Phone size={18} /> Ligar</a>
              <a className="btn-secondary" href={`https://wa.me/${waNumber(r.passenger_phone)}`} target="_blank" rel="noreferrer"><MessageCircle size={18} /> WhatsApp</a>
            </>
          )}
          <a className="btn-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${q}`} target="_blank" rel="noreferrer"><Navigation size={18} /> Google Maps</a>
          <a className="btn-secondary" href={`https://waze.com/ul?q=${q}&navigate=yes`} target="_blank" rel="noreferrer"><Navigation size={18} /> Waze</a>
        </div>
      )}
    </div>
  );
}

export default async function Motorista({ searchParams }: PageProps<"/motorista">) {
  const p = await getProfile();
  if (!p || !p.active) redirect("/motorista/login");
  if (p.role !== "driver") redirect("/motorista/login?conta=equipe");

  const supabase = await createClient();
  const pageValue = Number((await searchParams).page);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue <= 100000 ? pageValue : 1;
  const { data: me, error: meError } = await supabase.from("drivers").select("id, availability, active").eq("profile_id", p.id).maybeSingle();
  if (meError) return <main className="mx-auto max-w-md p-4"><p role="alert" className="card text-red-600">Não foi possível carregar seu cadastro. Tente novamente.</p></main>;
  if (!me?.active) return <main className="mx-auto max-w-md space-y-4 p-4"><p className="card">Seu acesso ainda não está vinculado a um motorista ativo. Entre em contato com a base.</p>{!me && <><Link href="/motorista/mensagens" className="btn-secondary">Mensagens com a base</Link><Link href="/motorista/telefone" className="btn-secondary">Cadastrar WhatsApp</Link></>}<form action={driverLogout}><button className="btn-secondary">Sair</button></form></main>;
  const [offers, rides, assignments] = await Promise.all([
    supabase.from("ride_assignments").select(`id, sent_at, ride:rides(${RIDE_COLS})`).eq("driver_id", me.id).eq("status", "sent").order("sent_at"),
    supabase.from("rides").select(RIDE_COLS, { count: "exact" }).eq("driver_id", me.id).in("status", ["scheduled", "confirmed", "in_progress"])
      .order("scheduled_at").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("ride_assignments").select("id, ride_id, status").eq("driver_id", me.id).in("status", ["sent", "accepted"]).order("sent_at", { ascending: false }),
  ]);
  const offerRows = (offers.data ?? []).flatMap((offer) => {
    const ride = Array.isArray(offer.ride) ? offer.ride[0] : offer.ride;
    return ride ? [{ id: offer.id, ride }] : [];
  });
  const offered = new Set(offerRows.map((o) => o.ride.id));
  const mine = (rides.data ?? []).filter((r) => !offered.has(r.id));
  const conversations = new Map((assignments.data ?? []).map((a) => [a.ride_id, a.id]));
  const availability = me.availability;

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-16">
      <RealtimeRefresh tables={RT_TABLES} poll={30000} />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Olá, {p.full_name}</h1>
          <p className="text-sm text-slate-500">Você está: <b>{AVAILABILITY[availability]?.label ?? availability}</b></p>
        </div>
        <form action={driverLogout}><button className="btn-secondary">Sair</button></form>
      </header>

      <form action={setMyAvailability} className="grid grid-cols-3 gap-2">
        {(["online", "busy", "offline"] as const).map((v) => (
          <button key={v} name="value" value={v} className={availability === v ? "btn-primary" : "btn-secondary"}>{AVAILABILITY[v].label}</button>
        ))}
      </form>

      <PushToggle />
      <nav className="grid grid-cols-2 gap-2" aria-label="Menu do motorista">
        <Link href="/motorista/mensagens" className="btn-primary col-span-2"><MessageCircle size={18} /> Mensagens com a base</Link>
        <Link href="/motorista/historico" className="btn-secondary">Histórico</Link>
        <Link href="/motorista/financeiro" className="btn-secondary">Meu financeiro</Link>
        <Link href="/motorista/telefone" className="btn-secondary col-span-2">Meu WhatsApp</Link>
      </nav>
      {(offers.error || rides.error || assignments.error || offerRows.length !== (offers.data?.length ?? 0)) && <p role="alert" className="card text-sm text-red-600">Não foi possível carregar todas as corridas. Atualize a página ou contate a base.</p>}

      {offerRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Novas corridas ({offerRows.length})</h2>
          {offerRows.map((o) => (
            <div key={o.id} className="card space-y-4 border-blue-400 dark:border-blue-600">
              <RideInfo r={o.ride} full={false} />
              <Link href={`/motorista/mensagens/${o.id}`} className="btn-secondary w-full"><MessageCircle size={18} /> Mensagens com a base</Link>
              <form action={respondAssignment}>
                <input type="hidden" name="assignment_id" value={o.id} />
                <button name="accept" value="true" className="btn-primary w-full">Aceitar corrida</button>
              </form>
              <details>
                <summary className="btn-secondary w-full list-none">Recusar</summary>
                <form action={respondAssignment} className="mt-3 space-y-2">
                  <input type="hidden" name="assignment_id" value={o.id} />
                  <input type="hidden" name="accept" value="false" />
                  <input name="reason" required maxLength={300} className="input" placeholder="Motivo da recusa" />
                  <button className="btn-danger w-full">Confirmar recusa</button>
                </form>
              </details>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-semibold">Minhas corridas</h2>
        {mine.length === 0 && <p className="card text-sm text-slate-500">Nenhuma corrida no momento.</p>}
        {mine.map((r) => (
          <div key={r.id} className="card space-y-4">
            <RideInfo r={r} full={r.status !== "scheduled"} />
            {["confirmed", "in_progress"].includes(r.status) && assignments.data?.some((assignment) => assignment.ride_id === r.id && assignment.status === "accepted") && <DriverRouteMap rideId={r.id} />}
            {conversations.get(r.id) && <Link href={`/motorista/mensagens/${conversations.get(r.id)}`} className="btn-secondary w-full"><MessageCircle size={18} /> Mensagens com a base</Link>}
            {r.status === "confirmed" && (
              <form action={driverRideStatus}>
                <input type="hidden" name="ride_id" value={r.id} />
                <button name="to" value="in_progress" className="btn-primary w-full">Iniciar corrida</button>
              </form>
            )}
            {r.status === "in_progress" && (
              <form action={driverRideStatus}>
                <input type="hidden" name="ride_id" value={r.id} />
                <button name="to" value="completed" className="btn-primary w-full bg-green-600 hover:bg-green-700">Finalizar corrida</button>
              </form>
            )}
            {r.status === "scheduled" && <p className="text-sm text-slate-500">Aguardando confirmação da base.</p>}
          </div>
        ))}
        {!rides.error && (rides.count ?? 0) > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={rides.count ?? 0} basePath="/motorista" params={{}} />}
      </section>

    </main>
  );
}
