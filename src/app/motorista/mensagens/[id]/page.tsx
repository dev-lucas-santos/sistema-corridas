import { redirect } from "next/navigation";
import { RideChat } from "@/components/ride-chat";
import { getProfile } from "@/lib/auth";

export default async function MensagensMotorista({ params, searchParams }: PageProps<"/motorista/mensagens/[id]">) {
  const profile = await getProfile();
  if (!profile || !profile.active) redirect("/motorista/login");
  if (profile.role !== "driver") redirect("/motorista/login?conta=equipe");
  const { id } = await params;
  const value = Number((await searchParams).page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <main className="mx-auto max-w-md p-4 pb-16"><RideChat id={id} profile={profile} page={page} /></main>;
}
