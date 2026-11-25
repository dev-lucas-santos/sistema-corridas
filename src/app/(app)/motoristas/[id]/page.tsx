import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { linkDriverProfile } from "@/app/actions/data";
import { DriverForm } from "../driver-form";

export default async function EditarMotorista({ params }: PageProps<"/motoristas/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: d }, { data: s }, profiles, linked] = await Promise.all([
    supabase.from("drivers").select("*").eq("id", id).maybeSingle(),
    supabase.from("driver_payout_settings").select("*").eq("driver_id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, role, active").neq("role", "admin").order("full_name"),
    supabase.from("drivers").select("profile_id").not("profile_id", "is", null),
  ]);
  if (!d) notFound();
  const used = new Set((linked.data ?? []).map((driver) => driver.profile_id));
  const available = (profiles.data ?? []).filter((profile) => !used.has(profile.id));
  return (
    <>
      <PageHeader title={d.full_name} />
      <div className="space-y-4">
        <DriverForm d={d} s={s ?? undefined} />
        <section className="card max-w-3xl space-y-3">
          <h2 className="font-semibold">Acesso ao aplicativo</h2>
          {d.profile_id ? <p className="text-sm">Este motorista já possui uma conta vinculada.</p> :
            profiles.error || linked.error ? <p role="alert" className="text-sm text-red-600">Não foi possível carregar as contas disponíveis.</p> :
            available.length === 0 ? <p className="text-sm text-slate-500">Nenhuma conta disponível. Crie uma conta no Supabase antes de vinculá-la aqui.</p> :
            <ActionForm action={linkDriverProfile} submitLabel="Vincular acesso">
              <p className="text-sm text-slate-500">A conta selecionada será ativada como motorista e deixará de ter acesso de operador.</p>
              <input type="hidden" name="driver_id" value={id} />
              <select name="profile_id" required defaultValue="" className="input" aria-label="Conta do motorista">
                <option value="" disabled>Escolha uma conta</option>
                {available.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name || profile.email} · {profile.email} · {profile.role === "driver" ? "motorista" : "operador"}</option>)}
              </select>
            </ActionForm>}
        </section>
      </div>
    </>
  );
}
