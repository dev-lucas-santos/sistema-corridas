import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { GlobalSearch } from "@/components/global-search";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { formatDateTime } from "@/lib/dates";
import Link from "next/link";

const RT_TABLES = ["rides", "drivers", "ride_assignments"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const [profile, { data: overdue }] = await Promise.all([requireStaff(), supabase.rpc("overdue_assignments")]);
  return (
    <div className="min-h-screen md:flex">
      <RealtimeRefresh tables={RT_TABLES} poll={60000} />
      <Sidebar name={profile.full_name || profile.email || ""} role={profile.role} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 p-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
          <GlobalSearch />
        </header>
        {overdue && overdue.length > 0 && (
          <div role="alert" className="border-b border-amber-300 bg-amber-100 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <b>Motorista sem resposta:</b>{" "}
            {overdue.map((o: { ride_id: string; driver_name: string; passenger_name: string; scheduled_at: string }, i: number) => (
              <span key={o.ride_id}>
                {i > 0 && " · "}
                <Link className="underline" href={`/corridas/${o.ride_id}`}>{o.driver_name} — {o.passenger_name} ({formatDateTime(o.scheduled_at)})</Link>
              </span>
            ))}
          </div>
        )}
        <main className="mx-auto max-w-7xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
