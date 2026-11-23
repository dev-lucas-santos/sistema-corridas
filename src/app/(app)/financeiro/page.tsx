import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pagination, PaymentBadge } from "@/components/common";
import { loadOptions } from "@/lib/options";
import { PAYMENT_STATUS, PERIOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";

const PAGE_SIZE = 25;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function FinanceiroPage({ searchParams }: PageProps<"/financeiro">) {
  const sp = await searchParams;
  const f = { driver: str(sp.driver), status: str(sp.status) };
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  const { drivers } = await loadOptions();

  let query = supabase.from("payment_closings")
    .select("id, period, period_start, period_end, net_cents, paid_cents, status, drivers(full_name)", { count: "exact" })
    .order("period_start", { ascending: false }).order("created_at", { ascending: false });
  if (/^[0-9a-f-]{36}$/.test(f.driver)) query = query.eq("driver_id", f.driver);
  if (f.status in PAYMENT_STATUS) query = query.eq("status", f.status);

  const [{ data, count }, { data: open }, { data: stats }] = await Promise.all([
    query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("payments").select("driver_id, amount_cents, drivers(full_name)").is("closing_id", null).limit(1000),
    supabase.rpc("dashboard_stats"),
  ]);

  // Corridas finalizadas ainda sem fechamento, somadas por motorista
  const byDriver = new Map<string, { name: string; n: number; total: number }>();
  for (const p of open ?? []) {
    const name = (p.drivers as unknown as { full_name: string } | null)?.full_name ?? "—";
    const cur = byDriver.get(p.driver_id) ?? { name, n: 0, total: 0 };
    cur.n += 1; cur.total += p.amount_cents;
    byDriver.set(p.driver_id, cur);
  }

  return (
    <>
      <PageHeader title="Financeiro">
        <Link href="/financeiro/clientes" className="btn-secondary">Faturamento por cliente</Link>
        <Link href="/financeiro/novo" className="btn-primary">+ Novo fechamento</Link>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card"><div className="text-sm text-slate-500">Total em aberto a pagar</div><div className="text-2xl font-bold text-amber-600">{formatBRL((stats as { payable_cents: number } | null)?.payable_cents)}</div></div>
      </div>

      <section className="card mb-4">
        <h2 className="mb-2 font-semibold">Corridas finalizadas sem fechamento</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {[...byDriver.entries()].map(([id, d]) => (
            <li key={id} className="flex items-center justify-between py-2 text-sm">
              <span>{d.name} <span className="text-slate-500">· {d.n} corrida(s)</span></span>
              <span className="flex items-center gap-3"><b>{formatBRL(d.total)}</b><Link className="text-blue-600 hover:underline" href={`/financeiro/novo?driver=${id}`}>Fechar</Link></span>
            </li>
          ))}
          {byDriver.size === 0 && <li className="py-2 text-sm text-slate-500">Nada pendente de fechamento.</li>}
        </ul>
      </section>

      <form className="card mb-4 grid gap-3 md:grid-cols-4">
        <select name="driver" defaultValue={f.driver} className="input">
          <option value="">Todos os motoristas</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select name="status" defaultValue={f.status} className="input">
          <option value="">Todos os status</option>
          {Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="flex gap-2 md:col-span-2"><button className="btn-primary flex-1">Filtrar</button><Link href="/financeiro" className="btn-secondary">Limpar</Link></div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Motorista</th><th className="th">Período</th><th className="th">Líquido</th><th className="th">Pago</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="td font-medium"><Link className="text-blue-600 hover:underline" href={`/financeiro/${c.id}`}>{(c.drivers as unknown as { full_name: string } | null)?.full_name}</Link></td>
                <td className="td whitespace-nowrap">{PERIOD_LABEL[c.period]} · {formatDate(c.period_start)} a {formatDate(c.period_end)}</td>
                <td className="td">{formatBRL(c.net_cents)}</td>
                <td className="td">{formatBRL(c.paid_cents)}</td>
                <td className="td"><PaymentBadge status={c.status} /></td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-slate-500" colSpan={5}>Nenhum fechamento.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/financeiro" params={f} />
    </>
  );
}
