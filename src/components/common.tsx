import Link from "next/link";
import { RIDE_STATUS, AVAILABILITY, PAYMENT_STATUS } from "@/lib/labels";

export function StatusBadge({ status }: { status: string }) {
  const s = RIDE_STATUS[status];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s?.cls}`}>{s?.label ?? status}</span>;
}

export function AvailabilityBadge({ value }: { value: string }) {
  const s = AVAILABILITY[value];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${s?.cls}`}>{s?.label ?? value}</span>;
}

export function PaymentBadge({ status }: { status: string }) {
  const s = PAYMENT_STATUS[status];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s?.cls ?? ""}`}>{s?.label ?? status}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Pagination({ page, pageSize, total, basePath, params }: { page: number; pageSize: number; total: number; basePath: string; params: Record<string, string | undefined> }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${basePath}?${sp}`;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-slate-500">{total} registro(s) · página {page} de {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-secondary" href={href(page - 1)}>Anterior</Link>}
        {page < pages && <Link className="btn-secondary" href={href(page + 1)}>Próxima</Link>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
