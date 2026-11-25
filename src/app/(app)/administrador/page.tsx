import Link from "next/link";
import { hasAdminAccess, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/dates";
import { PageHeader, Pagination } from "@/components/common";
import { UserAccessForm } from "@/components/user-access-form";
import { ActionForm } from "@/components/action-form";
import { unlockAdmin } from "@/app/actions/admin-access";

const PAGE_SIZE = 20;
const links = [
  { href: "/usuarios", title: "Usuários", description: "Gerenciar e desativar acessos da equipe." },
  { href: "/motoristas", title: "Motoristas", description: "Cadastrar, inativar e vincular contas de motoristas." },
  { href: "/financeiro", title: "Financeiro", description: "Gerenciar fechamentos e pagamentos." },
  { href: "/relatorios", title: "Relatórios", description: "Consultar e configurar relatórios." },
  { href: "/configuracoes", title: "Configurações", description: "Alterar parâmetros da base." },
  { href: "/auditoria", title: "Auditoria", description: "Consultar ações registradas no sistema." },
];

export default async function Administrador({ searchParams }: PageProps<"/administrador">) {
  await requireStaff();
  if (!(await hasAdminAccess())) return (
    <>
      <PageHeader title="Administrador" />
      <ActionForm action={unlockAdmin} submitLabel="Liberar acesso" className="card max-w-md space-y-4">
        <p className="text-sm text-slate-500">Informe a senha administrativa para liberar esta sessão até sair da conta.</p>
        <label className="label" htmlFor="admin-password">Senha administrativa</label>
        <input id="admin-password" name="password" type="password" autoComplete="off" maxLength={128} required className="input" />
      </ActionForm>
    </>
  );
  const pageNumber = Number((await searchParams).page);
  const page = Number.isSafeInteger(pageNumber) && pageNumber > 0 && pageNumber <= 100000 ? pageNumber : 1;
  const { data, count, error } = await (await createClient()).from("profiles")
    .select("id, full_name, email, role, created_at", { count: "exact" })
    .eq("active", false).neq("role", "driver").order("created_at", { ascending: false }).order("id")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  return (
    <>
      <PageHeader title="Administrador" />
      <p className="mb-4 text-sm text-slate-500">Acesso liberado nesta sessão. As alterações são aplicadas ao sistema e registradas na auditoria.</p>
      <section className="card">
        <h2 className="font-semibold">Aprovações e contas inativas</h2>
        <p className="mt-1 text-sm text-slate-500">Cadastros aguardando aprovação e contas desativadas aparecem juntos. Confira o usuário e o papel antes de aprovar.</p>
        {error ? <p role="alert" className="mt-3 text-red-600">Não foi possível carregar as contas. Atualize a página.</p> :
          <>
            <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
              {data?.map((user) => <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{user.full_name || "(sem nome)"}</p>
                  <p className="text-sm text-slate-500">{user.email ?? "Sem e-mail"} · cadastrado em {formatDateTime(user.created_at)}</p>
                </div>
                <UserAccessForm id={user.id} role={user.role} active={false} />
              </li>)}
              {!data?.length && <li className="py-2 text-slate-500">Nenhuma conta nesta página.</li>}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/administrador" params={{}} />
          </>}
      </section>
      <h2 className="mb-3 mt-6 font-semibold">Outras funções administrativas</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => <Link key={link.href} href={link.href} className="card block hover:border-blue-400">
          <h3 className="font-semibold text-blue-600">{link.title}</h3>
          <p className="mt-1 text-sm text-slate-500">{link.description}</p>
        </Link>)}
      </div>
    </>
  );
}
