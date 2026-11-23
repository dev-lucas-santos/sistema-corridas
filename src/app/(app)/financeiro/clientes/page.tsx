import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pagination, Field } from "@/components/common";
import { formatBRL } from "@/lib/money";
import { formatDateTime, dayStartISO, dayEndISO, todayBR } from "@/lib/dates";

const PAGE_SIZE = 50;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export default async function FaturamentoClientes({ searchParams }: PageProps<"/financeiro/clientes">) {
  const sp = await searchParams;
  const today = todayBR();
  const from = isDate(str(sp.from)) ? str(sp.from) : today.slice(0, 8) + "01";
  const to = isDate(str(sp.to)) ? str(sp.to) : today;
  const client = /^[0-9a-f-]{36}$/.test(str(sp.client)) ? str(sp.client) : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();

  const { data: summary } = await supabase.rpc("client_billing", { p_start: from, p_end: to });
  const grand = (summary ?? []).reduce((s: number, r: { total_cents: number }) => s + Number(r.total_cents), 0);

  let rides: { data: Record<string, unknown>[] | null; count: number | null } = { data: null, count: 0 };
  let clientName = "";
  if (client) {
    clientName = (summary ?? []).find((r: { client_id: string }) => r.client_id === client)?.legal_name ?? "";
    rides = await supabase.from("rides")
      .select("id, code, passenger_name, origin, destination, finished_at, scheduled_at, price_cents", { count: "exact" })
      .eq("client_id", client).eq("status", "completed")
      .gte("finished_at", dayStartISO(from)).lte("finished_at", dayEndISO(to))
      .order("finished_at").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  }

  return (
    <>
      <PageHeader title="Faturamento por cliente"><Link href="/financeiro" className="btn-secondary">Voltar</Link></PageHeader>
      <form className="card mb-4 grid gap-3 md:grid-cols-4">
        <Field label="De"><input name="from" type="date" defaultValue={from} className="input" /></Field>
        <Field label="Até"><input name="to" type="date" defaultValue={to} className="input" /></Field>
        <div className="flex items-end"><button className="btn-primary w-full">Aplicar</button></div>
      </form>

      <div className="card mb-4 overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Cliente</th><th className="th">Corridas</th><th className="th">Total a cobrar</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(summary ?? []).map((r: { client_id: string; legal_name: string; rides: number; total_cents: number }) => (
              <tr key={r.client_id} className={r.client_id === client ? "bg-blue-50 dark:bg-blue-950/30" : ""}>
                <td className="td font-medium"><Link className="text-blue-600 hover:underline" href={`/financeiro/clientes?from=${from}&to=${to}&client=${r.client_id}`}>{r.legal_name}</Link></td>
                <td className="td">{r.rides}</td>
                <td className="td">{formatBRL(r.total_cents)}</td>
              </tr>
            ))}
            {!summary?.length && <tr><td className="td text-slate-500" colSpan={3}>Nenhuma corrida realizada no período.</td></tr>}
          </tbody>
          {!!summary?.length && <tfoot><tr><td className="td font-semibold" colSpan={2}>Total</td><td className="td font-semibold">{formatBRL(grand)}</td></tr></tfoot>}
        </table>
      </div>

      {client && (
        <>
          <h2 className="mb-2 font-semibold">Corridas de {clientName}</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Finalizada</th><th className="th">Passageiro</th><th className="th">Trajeto</th><th className="th">Valor</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rides.data?.map((r) => (
                  <tr key={r.id as string}>
                    <td className="td"><Link className="text-blue-600 hover:underline" href={`/corridas/${r.id}`}>{r.code as number}</Link></td>
                    <td className="td whitespace-nowrap">{formatDateTime((r.finished_at ?? r.scheduled_at) as string)}</td>
                    <td className="td">{r.passenger_name as string}</td>
                    <td className="td max-w-64 truncate">{r.origin as string} → {r.destination as string}</td>
                    <td className="td">{formatBRL(r.price_cents as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={rides.count ?? 0} basePath="/financeiro/clientes" params={{ from, to, client }} />
        </>
      )}
    </>
  );
}
