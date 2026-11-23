import { createClient } from "@/lib/supabase/server";
import { PageHeader, Field } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { loadOptions } from "@/lib/options";
import { saveRecurring, toggleRecurring } from "@/app/actions/data";
import { formatBRL } from "@/lib/money";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default async function Recorrentes() {
  const supabase = await createClient();
  const { clients, drivers } = await loadOptions();
  const { data: rules } = await supabase.from("recurring_rules")
    .select("id, passenger_name, origin, destination, weekdays, pickup_time, price_cents, active, drivers(full_name)").order("created_at", { ascending: false }).limit(100);

  return (
    <>
      <PageHeader title="Corridas recorrentes" />
      <p className="mb-4 text-slate-500">Cadastre uma vez (ex.: toda segunda às 07:00) e o sistema cria as corridas dos próximos 7 dias automaticamente, todos os dias.</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ActionForm action={saveRecurring} submitLabel="Criar regra" className="card space-y-3">
          <Field label="Passageiro *"><input name="passenger_name" required className="input" /></Field>
          <Field label="Telefone"><input name="passenger_phone" className="input" /></Field>
          <Field label="Origem *"><input name="origin" required className="input" /></Field>
          <Field label="Destino *"><input name="destination" required className="input" /></Field>
          <Field label="Dias da semana *">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <label key={d} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 dark:border-slate-700">
                  <input type="checkbox" name="weekdays" value={i} /> {d}
                </label>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Horário *"><input name="pickup_time" type="time" required className="input" /></Field>
            <Field label="Valor (R$) *"><input name="price" required inputMode="decimal" className="input" /></Field>
            <Field label="Repasse (R$) *"><input name="payout" required inputMode="decimal" className="input" /></Field>
          </div>
          <Field label="Cliente"><select name="client_id" className="input"><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Motorista fixo"><select name="driver_id" className="input"><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        </ActionForm>
        <section className="card">
          <h2 className="mb-3 font-semibold">Regras cadastradas</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rules?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div className={r.active ? "" : "opacity-50"}>
                  <div className="font-medium">{r.passenger_name} · {r.weekdays.map((d: number) => DAYS[d]).join(", ")} {String(r.pickup_time).slice(0, 5)}</div>
                  <div className="text-sm text-slate-500">{r.origin} → {r.destination} · {formatBRL(r.price_cents)} · {(r.drivers as unknown as { full_name: string } | null)?.full_name ?? "sem motorista"}</div>
                </div>
                <form action={toggleRecurring}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="active" value={String(r.active)} />
                  <button className="btn-secondary min-h-9 text-sm">{r.active ? "Pausar" : "Ativar"}</button></form>
              </li>
            ))}
            {!rules?.length && <li className="py-2 text-slate-500">Nenhuma regra.</li>}
          </ul>
        </section>
      </div>
    </>
  );
}
