import { Field } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { saveClient } from "@/app/actions/data";

type C = { id?: string; legal_name?: string; cnpj?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; payment_terms?: string | null };

export function ClientForm({ c }: { c?: C }) {
  return (
    <ActionForm action={saveClient} className="card max-w-2xl space-y-4">
      {c?.id && <input type="hidden" name="id" value={c.id} />}
      <Field label="Razão social *"><input name="legal_name" required defaultValue={c?.legal_name} className="input" /></Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="CNPJ"><input name="cnpj" defaultValue={c?.cnpj ?? ""} placeholder="00.000.000/0000-00" className="input" /></Field>
        <Field label="Contato"><input name="contact_name" defaultValue={c?.contact_name ?? ""} className="input" /></Field>
        <Field label="E-mail"><input name="email" type="email" defaultValue={c?.email ?? ""} className="input" /></Field>
        <Field label="Telefone"><input name="phone" defaultValue={c?.phone ?? ""} className="input" /></Field>
      </div>
      <Field label="Condições de pagamento"><input name="payment_terms" defaultValue={c?.payment_terms ?? ""} className="input" /></Field>
    </ActionForm>
  );
}
