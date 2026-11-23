import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pagination } from "@/components/common";

const PAGE_SIZE = 20;

export default async function ClientesPage({ searchParams }: PageProps<"/clientes">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const supabase = await createClient();
  let query = supabase.from("clients").select("id, legal_name, cnpj, contact_name, phone, active", { count: "exact" }).order("legal_name");
  if (q) query = query.or(`legal_name.ilike.%${q.replace(/[,()%]/g, " ")}%,cnpj.ilike.%${q.replace(/[,()%]/g, " ")}%`);
  const { data, count } = await query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Clientes">
        <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar..." className="input w-56" /><button className="btn-secondary">Buscar</button></form>
        <Link href="/clientes/novo" className="btn-primary">+ Novo cliente</Link>
      </PageHeader>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">Empresa</th><th className="th">CNPJ</th><th className="th">Contato</th><th className="th">Telefone</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data?.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="td font-medium"><Link href={`/clientes/${c.id}`} className="text-blue-600 hover:underline">{c.legal_name}</Link></td>
                <td className="td">{c.cnpj ?? "—"}</td><td className="td">{c.contact_name ?? "—"}</td><td className="td">{c.phone ?? "—"}</td>
              </tr>
            ))}
            {!data?.length && <tr><td className="td text-slate-500" colSpan={4}>Nenhum cliente encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/clientes" params={{ q }} />
    </>
  );
}
