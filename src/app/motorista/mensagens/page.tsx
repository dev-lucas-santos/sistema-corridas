import { redirect } from "next/navigation";
import { GeneralChat } from "@/components/general-chat";
import { getProfile } from "@/lib/auth";

export default async function MensagensGeraisMotorista({ searchParams }: PageProps<"/motorista/mensagens">) {
  const profile = await getProfile();
  if (!profile || !profile.active) redirect("/motorista/login");
  if (profile.role !== "driver") redirect("/motorista/login?conta=equipe");
  const value = Number((await searchParams).page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <main className="mx-auto max-w-md p-4 pb-16"><GeneralChat profile={profile} driverId={profile.id} page={page} /></main>;
}
