import { notFound } from "next/navigation";
import { z } from "zod";
import { GeneralChat } from "@/components/general-chat";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function MensagensGeraisBase({ params, searchParams }: PageProps<"/mensagens/geral/[id]">) {
  const profile = await requireStaff();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { data: driver, error } = await (await createClient()).from("profiles")
    .select("full_name").eq("id", id).eq("role", "driver").maybeSingle();
  if (error) return <p role="alert" className="card text-red-600">Não foi possível carregar o motorista.</p>;
  if (!driver) notFound();
  const value = Number((await searchParams).page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <div className="max-w-2xl"><GeneralChat profile={profile} driverId={id} driverName={driver.full_name} page={page} /></div>;
}
