import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common";
import { loadOptions } from "@/lib/options";
import { toLocalInput } from "@/lib/dates";
import { RideForm } from "../../ride-form";

export default async function EditarCorrida({ params }: PageProps<"/corridas/[id]/editar">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: r } = await supabase.from("rides").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  const { clients, drivers } = await loadOptions();
  return (
    <>
      <PageHeader title={`Editar corrida #${r.code}`} />
      <RideForm clients={clients} drivers={drivers} ride={{ ...r, scheduled_at_local: toLocalInput(r.scheduled_at) }} />
    </>
  );
}
