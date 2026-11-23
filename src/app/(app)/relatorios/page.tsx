import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Field } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { createSchedule, deleteSchedule, sendScheduleNow, syncSheets, toggleSchedule } from "@/app/actions/reports";
import { rangeFor, type Frequency } from "@/lib/reports/period";
import { formatBRL } from "@/lib/money";
import { todayBR } from "@/lib/dates";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
const FREQ: Record<Frequency, string> = { daily: "Diário", weekly: "Semanal", monthly: "Mensal" };
type Row = { key: string; label: string; completed: number; cancelled: number; revenue_cents: number; payout_cents: number };

function Table({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th"></th><th className="th">Realizadas</th><th className="th">Canceladas</th><th className="th">Faturado</th><th className="th">Repasse</th><th className="th">Margem</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="td font-medium">{r.label}</td><td className="td">{r.completed}</td><td className="td">{r.cancelled}</td>
                <td className="td">{formatBRL(r.revenue_cents)}</td><td className="td">{formatBRL(r.payout_cents)}</td><td className="td">{formatBRL(r.revenue_cents - r.payout_cents)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="td text-slate-500" colSpan={6}>Sem dados no período.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function Relatorios({ searchParams }: PageProps<"/relatorios">) {
  await requireAdmin();
  const sp = await searchParams;
  const today = todayBR();
  const tipo = (["daily", "weekly", "monthly"] as const).find((t) => t === str(sp.tipo)) ?? "daily";
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.ref)) ? str(sp.ref) : today;
  const { start, end } = rangeFor(tipo, ref);
  const supabase = await createClient();

  const [totals, byDriver, byClient, byDay, schedules, drivers, clients, failed] = await Promise.all([
    supabase.rpc("report_totals", { p_start: start, p_end: end }).single<{ completed: number; cancelled: number; revenue_cents: number; payout_cents: number }>(),
    supabase.rpc("report_by", { p_start: start, p_end: end, p_dim: "driver" }),
    supabase.rpc("report_by", { p_start: start, p_end: end, p_dim: "client" }),
    supabase.rpc("report_by", { p_start: start, p_end: end, p_dim: "day" }),
    supabase.from("report_schedules").select("id, name, frequency, send_hour, recipients, active, last_sent_on").order("created_at"),
    supabase.from("drivers").select("id, full_name").order("full_name").limit(500),
    supabase.from("clients").select("id, legal_name").order("legal_name").limit(500),
    supabase.from("jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
  ]);
  const t = totals.data ?? { completed: 0, cancelled: 0, revenue_cents: 0, payout_cents: 0 };
  const card = (l: string, v: string, cls = "") => <div className="card"><div className="text-sm text-slate-500">{l}</div><div className={`text-xl font-bold ${cls}`}>{v}</div></div>;
  const tab = (k: string, l: string) => <Link key={k} href={`/relatorios?tipo=${k}&ref=${ref}`} className={tipo === k ? "btn-primary" : "btn-secondary"}>{l}</Link>;

  return (
    <>
      <PageHeader title="Relatórios" />
      {str(sp.ok) && <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{str(sp.ok)}</p>}
      {str(sp.erro) && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{str(sp.erro)}</p>}

      <form className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex gap-2">{tab("daily", "Diário")}{tab("weekly", "Semanal")}{tab("monthly", "Mensal")}</div>
        <input type="hidden" name="tipo" value={tipo} />
        <Field label="Data de referência"><input name="ref" type="date" defaultValue={ref} className="input" /></Field>
        <button className="btn-secondary">Atualizar</button>
        <span className="text-sm text-slate-500">{start === end ? start.split("-").reverse().join("/") : `${start.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}`}</span>
      </form>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {card("Realizadas", String(t.completed))}
        {card("Canceladas", String(t.cancelled), "text-red-600")}
        {card("Faturado", formatBRL(t.revenue_cents))}
        {card("Repasse aos motoristas", formatBRL(t.payout_cents))}
        {card("Margem da base", formatBRL(t.revenue_cents - t.payout_cents), "text-green-600")}
      </div>

      <div className="space-y-6">
        {tipo !== "daily" && <Table title="Por dia" rows={(byDay.data ?? []) as Row[]} />}
        <Table title="Por motorista" rows={(byDriver.data ?? []) as Row[]} />
        <Table title="Por cliente" rows={(byClient.data ?? []) as Row[]} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Exportar planilha</h2>
          <p className="text-sm text-slate-500">O Excel traz abas: Consolidado, Por dia, uma por motorista e uma por cliente.</p>
          <form action="/api/export" className="grid gap-3 md:grid-cols-2">
            <Field label="De"><input name="from" type="date" defaultValue={start} className="input" required /></Field>
            <Field label="Até"><input name="to" type="date" defaultValue={end} className="input" required /></Field>
            <Field label="Motorista"><select name="driver" className="input"><option value="">Todos</option>{drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field>
            <Field label="Cliente"><select name="client" className="input"><option value="">Todos</option>{clients.data?.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}</select></Field>
            <Field label="Formato"><select name="formato" className="input"><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option></select></Field>
            <div className="flex items-end"><button className="btn-primary w-full">Baixar</button></div>
          </form>
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Google Sheets</h2>
          <p className="text-sm text-slate-500">Cada corrida finalizada vira uma linha automaticamente (abas Consolidado, por motorista e por cliente). Para enviar corridas antigas que ainda não foram sincronizadas:</p>
          <form action={syncSheets} className="grid gap-3 md:grid-cols-3">
            <Field label="De"><input name="from" type="date" defaultValue={start} className="input" required /></Field>
            <Field label="Até"><input name="to" type="date" defaultValue={end} className="input" required /></Field>
            <div className="flex items-end"><button className="btn-secondary w-full">Sincronizar</button></div>
          </form>
          {!!failed.count && <p className="text-sm text-red-600">{failed.count} tarefa(s) em segundo plano falharam após várias tentativas. Verifique as credenciais e a tabela jobs.</p>}
        </section>
      </div>

      <section className="card mt-4 space-y-3">
        <h2 className="font-semibold">Envio automático por e-mail</h2>
        <p className="text-sm text-slate-500">O relatório do período encerrado (ontem, semana ou mês anterior) segue em anexo (.xlsx) no horário escolhido, gerado em segundo plano.</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {schedules.data?.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
              <span><b>{s.name}</b> · {FREQ[s.frequency as Frequency]} às {String(s.send_hour).padStart(2, "0")}h{!s.active && " (pausado)"}<span className="block text-xs text-slate-500">{s.recipients.join(", ")}</span></span>
              <span className="flex gap-3">
                <form action={sendScheduleNow}><input type="hidden" name="id" value={s.id} /><button className="text-blue-600 hover:underline">enviar agora</button></form>
                <form action={toggleSchedule}><input type="hidden" name="id" value={s.id} /><input type="hidden" name="active" value={String(s.active)} /><button className="text-slate-600 hover:underline">{s.active ? "pausar" : "ativar"}</button></form>
                <form action={deleteSchedule}><input type="hidden" name="id" value={s.id} /><button className="text-red-600 hover:underline">excluir</button></form>
              </span>
            </li>
          ))}
          {!schedules.data?.length && <li className="py-2 text-sm text-slate-500">Nenhum envio agendado.</li>}
        </ul>
        <ActionForm action={createSchedule} submitLabel="Agendar envio" className="grid gap-3 md:grid-cols-4">
          <Field label="Nome"><input name="name" className="input" required maxLength={80} placeholder="Diretoria" /></Field>
          <Field label="Frequência"><select name="frequency" className="input"><option value="daily">Diário</option><option value="weekly">Semanal (segunda)</option><option value="monthly">Mensal (dia 1)</option></select></Field>
          <Field label="Hora (Brasília)"><input name="send_hour" type="number" min={0} max={23} defaultValue={7} className="input" required /></Field>
          <Field label="E-mails (separe por vírgula)"><input name="recipients" className="input" required /></Field>
        </ActionForm>
      </section>
    </>
  );
}
