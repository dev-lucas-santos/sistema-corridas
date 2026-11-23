import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Field } from "@/components/common";
import { loadOptions } from "@/lib/options";
import { createClosing } from "@/app/actions/finance";
import { closingEnd } from "@/lib/finance/closing";
import { PERIOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate, todayBR } from "@/lib/dates";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function NovoFechamento({ searchParams }: PageProps<"/financeiro/novo">) {
  const sp = await searchParams;
  const { drivers } = await loadOptions();
  const driver = str(sp.driver);
  const period = (["weekly", "biweekly", "monthly"].includes(str(sp.period)) ? str(sp.period) : "weekly") as "weekly" | "biweekly" | "monthly";
  const start = /^\d{4}-\d{2}-\d{2}$/.test(str(sp.start)) ? str(sp.start) : todayBR().slice(0, 8) + "01";
  const erro = str(sp.erro);

  let preview: { rides: number; total_cents: number } | null = null;
  let end = "";
  if (/^[0-9a-f-]{36}$/.test(driver)) {
    end = closingEnd(period, start);
    const supabase = await createClient();
    const { data } = await supabase.rpc("closing_preview", { p_driver: driver, p_start: start, p_end: end });
    preview = data?.[0] ?? { rides: 0, total_cents: 0 };
  }

  return (
    <>
      <PageHeader title="Novo fechamento"><Link href="/financeiro" className="btn-secondary">Voltar</Link></PageHeader>
      {erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}
      <form className="card grid max-w-2xl gap-4 md:grid-cols-3">
        <Field label="Motorista">
          <select name="driver" defaultValue={driver} className="input" required>
            <option value="">Selecione</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Período">
          <select name="period" defaultValue={period} className="input">
            {Object.entries(PERIOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Início"><input name="start" type="date" defaultValue={start} className="input" required /></Field>
        <button className="btn-secondary md:col-span-3">Conferir corridas do período</button>
      </form>

      {preview && (
        <form action={createClosing} className="card mt-4 max-w-2xl space-y-3">
          <input type="hidden" name="driver_id" value={driver} />
          <input type="hidden" name="period" value={period} />
          <input type="hidden" name="start" value={start} />
          <p>Período: <b>{formatDate(start)} a {formatDate(end)}</b></p>
          <p><b>{preview.rides}</b> corrida(s) finalizada(s) sem fechamento · total <b>{formatBRL(preview.total_cents)}</b></p>
          <button className="btn-primary" disabled={preview.rides === 0}>Criar fechamento</button>
        </form>
      )}
    </>
  );
}
