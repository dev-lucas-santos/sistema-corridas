import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Pagination, PaymentBadge, Field } from "@/components/common";
import { ActionForm } from "@/components/action-form";
import { addAdjustment, registerPayment, removeAdjustment, deleteClosing } from "@/app/actions/finance";
import { PERIOD_LABEL } from "@/lib/labels";
import { remainingCents } from "@/lib/finance/closing";
import { formatBRL, centsToInput } from "@/lib/money";
import { formatDate, formatDateTime, todayBR } from "@/lib/dates";

const PAGE_SIZE = 50;

export default async function FechamentoPage({ params, searchParams }: PageProps<"/financeiro/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const page = Math.max(1, Number(sp.page) || 1);
  const erro = typeof sp.erro === "string" ? sp.erro : "";
  const supabase = await createClient();

  const { data: c } = await supabase.from("payment_closings")
    .select("id, period, period_start, period_end, rides_total_cents, adjustments_total_cents, net_cents, paid_cents, status, drivers(full_name)")
    .eq("id", id).single();
  if (!c) notFound();

  const [rides, adjs, pays] = await Promise.all([
    supabase.from("payments").select("id, amount_cents, rides(id, code, passenger_name, origin, destination, finished_at, scheduled_at)", { count: "exact" })
      .eq("closing_id", id).order("created_at").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("adjustments").select("id, amount_cents, reason, created_at").eq("closing_id", id).order("created_at"),
    supabase.from("closing_payments").select("id, amount_cents, paid_at, receipt_path, note").eq("closing_id", id).order("paid_at"),
  ]);
  const receipts = await Promise.all((pays.data ?? []).map(async (p) =>
    p.receipt_path ? (await supabase.storage.from("receipts").createSignedUrl(p.receipt_path, 600)).data?.signedUrl ?? null : null));

  const remaining = remainingCents(c.net_cents, c.paid_cents);
  const driverName = (c.drivers as unknown as { full_name: string } | null)?.full_name;

  return (
    <>
      <PageHeader title={`Fechamento · ${driverName}`}><Link href="/financeiro" className="btn-secondary">Voltar</Link></PageHeader>
      {erro && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{erro}</p>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="card"><div className="text-sm text-slate-500">Período</div><div className="font-semibold">{PERIOD_LABEL[c.period]}<br /><span className="text-sm font-normal">{formatDate(c.period_start)} a {formatDate(c.period_end)}</span></div></div>
        <div className="card"><div className="text-sm text-slate-500">Corridas</div><div className="text-xl font-bold">{formatBRL(c.rides_total_cents)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Ajustes</div><div className="text-xl font-bold">{formatBRL(c.adjustments_total_cents)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Total a pagar</div><div className="text-xl font-bold">{formatBRL(c.net_cents)}</div></div>
        <div className="card"><div className="text-sm text-slate-500">Pago / saldo</div><div className="text-xl font-bold">{formatBRL(c.paid_cents)}</div><div className="text-sm text-slate-500">saldo {formatBRL(remaining)} · <PaymentBadge status={c.status} /></div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-3">
          <h2 className="font-semibold">Ajustes (descontos e acréscimos)</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {adjs.data?.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{a.reason}<span className="block text-xs text-slate-500">{formatDateTime(a.created_at)}</span></span>
                <span className="flex items-center gap-3">
                  <b className={a.amount_cents < 0 ? "text-red-600" : "text-green-600"}>{formatBRL(a.amount_cents)}</b>
                  {c.status !== "paid" && (
                    <form action={removeAdjustment}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="closing_id" value={id} /><button className="text-xs text-red-600 hover:underline">remover</button></form>
                  )}
                </span>
              </li>
            ))}
            {!adjs.data?.length && <li className="py-2 text-sm text-slate-500">Nenhum ajuste.</li>}
          </ul>
          {c.status !== "paid" && (
            <ActionForm action={addAdjustment} submitLabel="Lançar ajuste" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="closing_id" value={id} />
              <Field label="Tipo"><select name="kind" className="input"><option value="discount">Desconto</option><option value="addition">Acréscimo</option></select></Field>
              <Field label="Valor (R$)"><input name="value" className="input" inputMode="decimal" required /></Field>
              <div className="md:col-span-2"><Field label="Justificativa"><input name="reason" className="input" required minLength={3} maxLength={300} /></Field></div>
            </ActionForm>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="font-semibold">Pagamentos</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {pays.data?.map((p, i) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{formatDate(p.paid_at)}{p.note && <span className="text-slate-500"> · {p.note}</span>}
                  {receipts[i] && <a className="ml-2 text-blue-600 hover:underline" href={receipts[i]!} target="_blank" rel="noreferrer">comprovante</a>}</span>
                <b>{formatBRL(p.amount_cents)}</b>
              </li>
            ))}
            {!pays.data?.length && <li className="py-2 text-sm text-slate-500">Nenhum pagamento registrado.</li>}
          </ul>
          {remaining > 0 && (
            <ActionForm action={registerPayment} submitLabel="Registrar pagamento" className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="closing_id" value={id} />
              <Field label="Valor pago (R$)" hint={`Saldo: ${formatBRL(remaining)}`}><input name="amount" defaultValue={centsToInput(remaining)} className="input" inputMode="decimal" required /></Field>
              <Field label="Data do pagamento"><input name="paid_at" type="date" defaultValue={todayBR()} className="input" required /></Field>
              <Field label="Observação"><input name="note" className="input" maxLength={300} /></Field>
              <Field label="Comprovante (PDF ou imagem)"><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="input py-2" /></Field>
            </ActionForm>
          )}
          {!pays.data?.length && (
            <form action={deleteClosing}><input type="hidden" name="id" value={id} /><button className="btn-danger w-full">Desfazer fechamento</button></form>
          )}
        </section>
      </div>

      <h2 className="mb-2 mt-6 font-semibold">Corridas do fechamento</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead><tr><th className="th">#</th><th className="th">Finalizada</th><th className="th">Passageiro</th><th className="th">Trajeto</th><th className="th">Repasse</th></tr></thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rides.data?.map((p) => {
              const r = p.rides as unknown as { id: string; code: number; passenger_name: string; origin: string; destination: string; finished_at: string | null; scheduled_at: string } | null;
              return (
                <tr key={p.id}>
                  <td className="td">{r && <Link className="text-blue-600 hover:underline" href={`/corridas/${r.id}`}>{r.code}</Link>}</td>
                  <td className="td whitespace-nowrap">{formatDateTime(r?.finished_at ?? r?.scheduled_at)}</td>
                  <td className="td">{r?.passenger_name}</td>
                  <td className="td max-w-64 truncate">{r?.origin} → {r?.destination}</td>
                  <td className="td">{formatBRL(p.amount_cents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={rides.count ?? 0} basePath={`/financeiro/${id}`} params={{}} />
    </>
  );
}
