import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PaymentBadge } from "@/components/common";
import { PERIOD_LABEL } from "@/lib/labels";
import { formatBRL } from "@/lib/money";
import { formatDate } from "@/lib/dates";

export default async function MeuFinanceiro() {
  const p = await getProfile();
  if (!p || !p.active) redirect("/motorista/login");
  if (p.role !== "driver") redirect("/motorista/login?conta=equipe");
  const supabase = await createClient();
  const [{ data: open }, { data: closings }] = await Promise.all([
    supabase.from("payments").select("amount_cents").is("closing_id", null).limit(1000),
    supabase.from("payment_closings").select("id, period, period_start, period_end, net_cents, paid_cents, status").order("period_start", { ascending: false }).limit(30),
  ]);
  const unclosed = (open ?? []).reduce((s, x) => s + x.amount_cents, 0);
  const toReceive = (closings ?? []).reduce((s, c) => s + (c.net_cents - c.paid_cents), 0);

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-16">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Meu financeiro</h1>
        <Link href="/motorista" className="btn-secondary">Voltar</Link>
      </header>
      <div className="grid grid-cols-2 gap-3">
        <div className="card"><div className="text-sm text-slate-500">Ainda sem fechamento</div><div className="text-xl font-bold">{formatBRL(unclosed)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Fechado a receber</div><div className="text-xl font-bold text-green-700 dark:text-green-400">{formatBRL(toReceive)}</div></div>
      </div>
      <h2 className="font-semibold">Fechamentos</h2>
      {closings?.map((c) => (
        <div key={c.id} className="card space-y-1 text-sm">
          <div className="flex items-center justify-between"><b>{PERIOD_LABEL[c.period]} · {formatDate(c.period_start)} a {formatDate(c.period_end)}</b><PaymentBadge status={c.status} /></div>
          <div className="flex justify-between"><span>Total</span><b>{formatBRL(c.net_cents)}</b></div>
          <div className="flex justify-between"><span>Pago</span><span>{formatBRL(c.paid_cents)}</span></div>
        </div>
      ))}
      {!closings?.length && <p className="card text-sm text-slate-500">Nenhum fechamento ainda.</p>}
    </main>
  );
}
