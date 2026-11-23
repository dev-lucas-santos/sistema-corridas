import { Field } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { saveDriver } from "@/app/actions/data";
import { centsToInput } from "@/lib/money";

type D = Record<string, string | number | null | undefined>;

export function DriverForm({ d, s }: { d?: D; s?: D }) {
  return (
    <ActionForm action={saveDriver} className="card max-w-3xl space-y-4">
      {d?.id && <input type="hidden" name="id" value={String(d.id)} />}
      <h2 className="font-semibold">Dados pessoais</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome completo *"><input name="full_name" required defaultValue={d?.full_name ?? ""} className="input" /></Field>
        <Field label="Telefone / WhatsApp"><input name="phone" defaultValue={d?.phone ?? ""} className="input" /></Field>
        <Field label="E-mail"><input name="email" type="email" defaultValue={d?.email ?? ""} className="input" /></Field>
        <Field label="CPF"><input name="cpf" defaultValue={d?.cpf ?? ""} className="input" /></Field>
        <Field label="Nº da CNH"><input name="cnh_number" defaultValue={d?.cnh_number ?? ""} className="input" /></Field>
        <Field label="Validade da CNH"><input name="cnh_expires_on" type="date" defaultValue={d?.cnh_expires_on ?? ""} className="input" /></Field>
        <Field label="Placa"><input name="vehicle_plate" defaultValue={d?.vehicle_plate ?? ""} className="input uppercase" /></Field>
        <Field label="Modelo do veículo"><input name="vehicle_model" defaultValue={d?.vehicle_model ?? ""} className="input" /></Field>
      </div>
      <h2 className="pt-2 font-semibold">Pagamento (visível só ao administrador)</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Chave PIX"><input name="pix_key" defaultValue={s?.pix_key ?? ""} className="input" /></Field>
        <Field label="Tipo de repasse">
          <select name="payout_type" defaultValue={String(s?.payout_type ?? "percent")} className="input">
            <option value="percent">Percentual do valor da corrida</option>
            <option value="fixed">Valor fixo por corrida</option>
          </select>
        </Field>
        <Field label="Percentual (%)" hint="Usado quando o tipo é percentual">
          <input name="payout_percent" type="number" step="0.01" min="0" max="100" defaultValue={((Number(s?.payout_percent_bp ?? 7000)) / 100).toString()} className="input" />
        </Field>
        <Field label="Valor fixo (R$)" hint="Usado quando o tipo é valor fixo">
          <input name="payout_fixed" inputMode="decimal" defaultValue={centsToInput(Number(s?.payout_fixed_cents ?? 0))} className="input" />
        </Field>
      </div>
    </ActionForm>
  );
}
