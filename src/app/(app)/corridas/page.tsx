import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pagination, StatusBadge } from "@/components/common";
import { loadOptions } from "@/lib/options";
import { RIDE_STATUS } from "@/lib/labels";
import { formatBRL, parseBRLToCents } from "@/lib/money";
import { formatDateTime, dayStartISO, dayEndISO } from "@/lib/dates";

const PAGE_SIZE = 25;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CorridasPage({ searchParams }: PageProps<"/corridas">) {
  const sp = await searchParams;
  const f = { status: str(sp.status), driver: str(sp.driver), client: str(sp.client), from: str(sp.from), to: str(sp.to), min: str(sp.min), max: str(sp.max), q: str(sp.q).trim() };
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const { clients, drivers } = await loadOptions();

  // Embed (join) em uma única consulta: sem N+1
  let query = supabase.from("rides")
    .select("id, code, passenger_name, passenger_phone, origin, destination, scheduled_at, price_cents, status, clients(legal_name), drivers(full_name)", { count: "exact" })
    .order("scheduled_at", { ascending: false });
  if (f.status && f.status in RIDE_STATUS) query = query.eq("status", f.status);
  if (/^[0-9a-f-]{36}$/.test(f.driver)) query = query.eq("driver_id", f.driver);
  if (f.driver === "none") query = query.is("driver_id", null);
  if (/^[0-9a-f-]{36}$/.test(f.client)) query = query.eq("client_id", f.client);
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.from)) query = query.gte("scheduled_at", dayStartISO(f.from));
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.to)) query = query.lte("scheduled_at", dayEndISO(f.to));
  if (f.min) query = query.gte("price_cents", parseBRLToCents(f.min));
  if (f.max) query = query.lte("price_cents", parseBRLToCents(f.max));
  if (f.q) { const s = f.q.replace(/[,()%]/g, " "); query = query.or(`passenger_name.ilike.%${s}%,passenger_phone.ilike.%${s}%`); }
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Corridas"><Link href="/corridas/nova" className="btn-primary">+ Nova corrida</Link></PageHeader>
      <form className="card mb-4 grid gap-3 md:grid-cols-4 lg:grid-cols-6">
        <input name="q" defaultValue={f.q} placeholder="Passageiro ou telefone" className="input md:col-span-2" />
        <select name="status" defaultValue={f.status} className="input">
          <option value="">Todos os status</option>
          {Object.entries(RIDE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="driver" defaultValue={f.driver} className="input">
          <option value="">Todos os motoristas</option><option value="none">Sem motorista</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="client" defaultValue={f.client} className="input">
          <option value="">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input name="from" type="date" defaultValue={f.from} className="input" aria-label="De" />
        <input name="to" type="date" defaultValue={f.to} className="input" aria-label="Até" />
        <input name="min" defaultValue={f.min} placeholder="Valor mín. (R$)" className="input" inputMode="decimal" />
        <input name="max" defaultValue={f.max} placeholder="Valor máx. (R$)" className="input" inputMode="decimal" />
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary flex-1">Filtrar</button><Link href="/corridas" className="btn-secondary">Limpar</Link></div>
      </form>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">#</th><th className="th">Quando</th><th className="th">Passageiro</th><th className="th">Trajeto</th><th className="th">Cliente</th><th className="th">Motorista</th><th className="th">Valor</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.map((r) => {
              const client = r.clients as unknown as { legal_name: string } | null;
              const driver = r.drivers as unknown as { full_name: string } | null;
              return (
                <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="td"><Link className="text-blue-600 hover:underline" href={`/corridas/${r.id}`}>{r.code}</Link></td>
                  <td className="td whitespace-nowrap">{formatDateTime(r.scheduled_at)}</td>
                  <td className="td font-medium">{r.passenger_name}<div className="text-xs font-normal text-slate-500">{r.passenger_phone}</div></td>
                  <td className="td max-w-64 truncate">{r.origin} → {r.destination}</td>
                  <td className="td">{client?.legal_name ?? "—"}</td>
                  <td className="td">{driver?.full_name ?? <span className="text-amber-600">Sem motorista</span>}</td>
                  <td className="td whitespace-nowrap">{formatBRL(r.price_cents)}</td>
                  <td className="td"><StatusBadge status={r.status} /></td>
                </tr>
              );
            })}
            {!data?.length && <tr><td className="td text-slate-500" colSpan={8}>Nenhuma corrida encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/corridas" params={f} />
    </>
  );
}
