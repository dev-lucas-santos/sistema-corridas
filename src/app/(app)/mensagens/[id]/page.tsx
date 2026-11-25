import { RideChat } from "@/components/ride-chat";
import { requireStaff } from "@/lib/auth";

export default async function MensagensCorrida({ params, searchParams }: PageProps<"/mensagens/[id]">) {
  const profile = await requireStaff();
  const { id } = await params;
  const value = Number((await searchParams).page);
  const page = Number.isSafeInteger(value) && value > 0 ? value : 1;
  return <div className="max-w-2xl"><RideChat id={id} profile={profile} page={page} /></div>;
}
