import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common";
import { ClientForm } from "../client-form";

export default async function EditarCliente({ params }: PageProps<"/clientes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  return (<><PageHeader title={data.legal_name} /><ClientForm c={data} /></>);
}
