"use client";

import { useActionState } from "react";
import { assignRide, changeStatus } from "@/app/actions/data";

type Opt = { id: string; name: string; hint?: string };

export function AssignPanel({ rideId, drivers, current }: { rideId: string; drivers: Opt[]; current: string | null }) {
  const [state, action, pending] = useActionState(assignRide, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="ride_id" value={rideId} />
      <select name="driver_id" defaultValue={current ?? ""} className="input" aria-label="Motorista">
        <option value="" disabled>Escolha o motorista</option>
        {drivers.map((d) => <option key={d.id} value={d.id}>{d.hint} {d.name}</option>)}
      </select>
      <button className="btn-primary w-full" disabled={pending}>{current ? "Reenviar / trocar motorista" : "Enviar ao motorista"}</button>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </form>
  );
}

const NEXT: Record<string, { to: string; label: string }[]> = {
  pending: [{ to: "scheduled", label: "Marcar agendada" }],
  scheduled: [{ to: "confirmed", label: "Confirmar" }],
  confirmed: [{ to: "in_progress", label: "Iniciar" }],
  in_progress: [{ to: "completed", label: "Finalizar" }],
};

export function StatusPanel({ rideId, status }: { rideId: string; status: string }) {
  const [state, action, pending] = useActionState(changeStatus, undefined);
  if (status === "completed" || status === "cancelled") return <p className="text-sm text-slate-500">Corrida encerrada.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(NEXT[status] ?? []).map((n) => (
          <form key={n.to} action={action}>
            <input type="hidden" name="ride_id" value={rideId} /><input type="hidden" name="to" value={n.to} />
            <button className="btn-secondary" disabled={pending}>{n.label}</button>
          </form>
        ))}
      </div>
      <form action={action} className="flex gap-2">
        <input type="hidden" name="ride_id" value={rideId} /><input type="hidden" name="to" value="cancelled" />
        <input name="reason" required placeholder="Motivo do cancelamento" className="input" />
        <button className="btn-danger" disabled={pending}>Cancelar</button>
      </form>
      {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
    </div>
  );
}
