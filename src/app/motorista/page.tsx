import { redirect } from "next/navigation";
import Link from "next/link";
import { Phone, MessageCircle, Navigation, MapPin } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/actions/auth";
import { respondAssignment, driverRideStatus, setMyAvailability } from "@/app/actions/driver";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { AVAILABILITY } from "@/lib/labels";
import { StatusBadge } from "@/components/common";
import { PushToggle } from "@/components/push-toggle";
import { RealtimeRefresh } from "@/components/realtime-refresh";

type Ride = {
  id: string; passenger_name: string; passenger_phone: string | null; origin: string; destination: string;
  scheduled_at: string; driver_payout_cents: number | null; notes: string | null; status: string;
};
const RIDE_COLS = "id, passenger_name, passenger_phone, origin, destination, scheduled_at, driver_payout_cents, notes, status";
const RT_TABLES = ["rides", "ride_assignments"];

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

export default async function Motorista() {
  const p = await getProfile();
  if (!p) redirect("/login");
  if (p.role !== "driver") redirect("/painel");

  const supabase = await createClient();
  const { data: me } = await supabase.from("drivers").select("id, availability").eq("profile_id", p.id).maybeSingle();
  const [offers, rides, done] = await Promise.all([
    supabase.from("ride_assignments").select(`id, sent_at, ride:rides(${RIDE_COLS})`).eq("status", "sent").order("sent_at"),
    supabase.from("rides").select(RIDE_COLS).in("status", ["scheduled", "confirmed", "in_progress"]).order("scheduled_at").limit(50),
    supabase.from("rides").select(RIDE_COLS).eq("status", "completed").order("scheduled_at", { ascending: false }).limit(5),
  ]);
  const offerRows = (offers.data ?? []) as unknown as { id: string; ride: Ride }[];
  const offered = new Set(offerRows.map((o) => o.ride.id));
  const mine = ((rides.data ?? []) as Ride[]).filter((r) => !offered.has(r.id));
  const availability = me?.availability ?? "offline";

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-16">
      <RealtimeRefresh tables={RT_TABLES} />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Olá, {p.full_name}</h1>
          <p className="text-sm text-slate-500">Você está: <b>{AVAILABILITY[availability]?.label ?? availability}</b></p>
        </div>
        <form action={logout}><button className="btn-secondary">Sair</button></form>
      </header>

      <form action={setMyAvailability} className="grid grid-cols-3 gap-2">
        {(["online", "busy", "offline"] as const).map((v) => (
          <button key={v} name="value" value={v} className={availability === v ? "btn-primary" : "btn-secondary"}>{AVAILABILITY[v].label}</button>
        ))}
      </form>

      <PushToggle />
      <Link href="/motorista/financeiro" className="btn-secondary w-full">Meu financeiro</Link>

      {offerRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Novas corridas ({offerRows.length})</h2>
          {offerRows.map((o) => (
            <div key={o.id} className="card space-y-4 border-blue-400 dark:border-blue-600">
              <RideInfo r={o.ride} full={false} />
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
      </section>

      {(done.data?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Últimas realizadas</h2>
          {(done.data as Ride[]).map((r) => (
            <div key={r.id} className="card flex justify-between text-sm">
              <span>{r.passenger_name}<br /><span className="text-slate-500">{formatDateTime(r.scheduled_at)}</span></span>
              <b>{formatBRL(r.driver_payout_cents)}</b>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
