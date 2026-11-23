import { saveSettings } from "@/app/actions/settings";
import { ActionForm } from "@/components/action-form";
import { Field, PageHeader } from "@/components/common";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function Configuracoes() {
  await requireAdmin();
  const { data } = await (await createClient()).from("settings").select("value").eq("key", "driver_response_timeout_minutes").maybeSingle();
  const timeout = Number(data?.value ?? 10);
  return (
    <>
      <PageHeader title="Configurações" />
      <ActionForm action={saveSettings} className="card max-w-md space-y-4">
        <Field label="Prazo de resposta do motorista (minutos)" hint="Se o motorista não aceitar nem recusar dentro desse prazo, a base é alertada.">
          <input name="timeout" type="number" min={1} max={240} required defaultValue={timeout} className="input" />
        </Field>
      </ActionForm>
    </>
  );
}
