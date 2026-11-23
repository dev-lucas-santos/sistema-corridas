import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { PageHeader, Pagination, AvailabilityBadge } from "@/components/common";
import { setAvailability } from "@/app/actions/data";

const PAGE_SIZE = 20;

export default async function MotoristasPage({ searchParams }: PageProps<"/motoristas">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().replace(/[,()%]/g, " ") : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const supabase = await createClient();
  let query = supabase.from("drivers").select("id, full_name, phone, vehicle_plate, vehicle_model, availability, active", { count: "exact" }).order("full_name");
  if (q) query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,vehicle_plate.ilike.%${q}%`);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Motoristas">
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar..." className="input w-56" /><button className="btn-secondary">Buscar</button></form>
        {isAdmin && <Link href="/motoristas/novo" className="btn-primary">+ Novo motorista</Link>}
      </PageHeader>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Nome</th><th className="th">Telefone</th><th className="th">Veículo</th><th className="th">Situação</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.map((d) => (
              <tr key={d.id}>
                <td className="td font-medium">{isAdmin ? <Link href={`/motoristas/${d.id}`} className="text-blue-600 hover:underline">{d.full_name}</Link> : d.full_name}</td>
                <td className="td">{d.phone ?? "—"}</td>
                <td className="td">{d.vehicle_model ?? "—"} {d.vehicle_plate && `· ${d.vehicle_plate}`}</td>
                <td className="td">
                  <form action={setAvailability} className="flex items-center gap-2">
                    <input type="hidden" name="driver_id" value={d.id} />
                    <AvailabilityBadge value={d.availability} />
                    <select name="value" defaultValue={d.availability} className="rounded border border-slate-300 bg-transparent px-1 py-1 text-sm dark:border-slate-700">
                      <option value="online">Online</option><option value="busy">Ocupado</option><option value="offline">Offline</option>
                    </select>
                    <button className="btn-secondary min-h-8 px-2 text-sm">OK</button>
                  </form>
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-slate-500" colSpan={4}>Nenhum motorista.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/motoristas" params={{ q }} />
    </>
  );
}
