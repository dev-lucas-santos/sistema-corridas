import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common";
import { DriverForm } from "../driver-form";

export default async function EditarMotorista({ params }: PageProps<"/motoristas/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: d }, { data: s }] = await Promise.all([
    supabase.from("drivers").select("*").eq("id", id).maybeSingle(),
    supabase.from("driver_payout_settings").select("*").eq("driver_id", id).maybeSingle(),
  ]);
  if (!d) notFound();
  return (<><PageHeader title={d.full_name} /><DriverForm d={d} s={s ?? undefined} /></>);
}
