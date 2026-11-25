import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm } from "@/components/action-form";
import { requestDriverPhone, confirmDriverPhone } from "@/app/actions/driver-phone";

export default async function TelefoneMotorista() {
  const profile = await getProfile();
  if (!profile?.active) redirect("/motorista/login");
  if (profile.role !== "driver") redirect("/motorista/login?conta=equipe");
  const supabase = await createClient();
  const [{ data, error }, driver] = await Promise.all([
    supabase.from("profiles").select("phone, whatsapp_confirmed_at").eq("id", profile.id).single(),
    supabase.from("drivers").select("active").eq("profile_id", profile.id).maybeSingle(),
  ]);
  if (error || driver.error) return <main className="mx-auto max-w-md p-4"><p role="alert" className="card text-red-600">Não foi possível carregar seu cadastro.</p></main>;
  if (driver.data && !driver.data.active) return <main className="mx-auto max-w-md p-4"><p className="card">Seu cadastro está inativo. Entre em contato com a base.</p></main>;
  return (
    <main className="mx-auto max-w-md space-y-4 p-4">
      <Link href="/motorista" className="text-sm text-blue-600 underline">← Voltar</Link>
      <h1 className="text-2xl font-bold">Meu WhatsApp</h1>
      <p className="text-sm text-slate-500">{data.whatsapp_confirmed_at ? `Número confirmado: ${data.phone}` : "Nenhum número confirmado."}</p>
      <ActionForm action={requestDriverPhone} submitLabel="Enviar código" className="card space-y-3">
        <label htmlFor="phone" className="label">Celular com WhatsApp e DDD</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" required placeholder="(11) 99999-9999" className="input" />
        <p className="text-sm text-slate-500">Seu número atual só será alterado após a confirmação.</p>
      </ActionForm>
      <ActionForm action={confirmDriverPhone} submitLabel="Confirmar código" className="card space-y-3">
        <label htmlFor="code" className="label">Código recebido</label>
        <input id="code" name="code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className="input" />
      </ActionForm>
    </main>
  );
}
