"use client";

import { useEffect, useState } from "react";
import { saveRide } from "@/app/actions/data";
import { extractFromText } from "@/app/actions/inbound";
import type { Extracted } from "@/lib/ai/extract";
import { ActionForm } from "@/components/action-form";
import { Field } from "@/components/common";
import { createClient } from "@/lib/supabase/client";
import { centsToInput, parseBRLToCents } from "@/lib/money";
import { fromLocalInput, formatDateTime } from "@/lib/dates";

type Opt = { id: string; name: string; hint?: string };
type Ride = {
  id?: string; passenger_name?: string; passenger_phone?: string | null; origin?: string; destination?: string;
  scheduled_at_local?: string; price_cents?: number; driver_payout_cents?: number; client_id?: string | null; driver_id?: string | null; notes?: string | null;
};

export function RideForm({ clients, drivers, ride, initial, inboundId, source: initialSource, rawMessage }: {
  clients: Opt[]; drivers: Opt[]; ride?: Ride; initial?: Extracted; inboundId?: string; source?: "whatsapp" | "email"; rawMessage?: string;
}) {
  const [when, setWhen] = useState(ride?.scheduled_at_local ?? initial?.scheduled_at_local ?? "");
  const [driver, setDriver] = useState(ride?.driver_id ?? "");
  const [price, setPrice] = useState(ride ? centsToInput(ride.price_cents) : initial?.price ?? "");
  const [payout, setPayout] = useState(ride ? centsToInput(ride.driver_payout_cents) : "");
  const [payoutEdited, setPayoutEdited] = useState(!!ride);
  const [conflicts, setConflicts] = useState<{ passenger_name: string; scheduled_at: string }[]>([]);
  const [fill, setFill] = useState<Extracted | undefined>(initial);
  const [rev, setRev] = useState(0);
  const [paste, setPaste] = useState("");
  const [pasted, setPasted] = useState("");
  const [reading, setReading] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  async function readMessage() {
    setReading(true);
    setAiMsg(null);
    const r = await extractFromText(paste);
    setReading(false);
    if (!r.ok) return setAiMsg(r.error);
    setFill(r.data);
    setWhen(r.data.scheduled_at_local);
    setPrice(r.data.price);
    setPayoutEdited(false);
    setPasted(paste);
    setRev((n) => n + 1);
    setAiMsg("Campos preenchidos. Revise tudo antes de salvar.");
  }

  const matchedClient = (() => {
    const n = fill?.client_name.toLowerCase();
    if (!n) return "";
    return clients.find((c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))?.id ?? "";
  })();
  const src = pasted ? "ai_paste" : initialSource ?? "manual";
  const raw = pasted || rawMessage || "";

  // Aviso de conflito de horário
  useEffect(() => {
    if (!driver || !when) return;
    let cancelled = false;
    createClient().rpc("driver_conflicts", { p_driver: driver, p_at: fromLocalInput(when), p_exclude: ride?.id ?? null }).then(({ data }) => {
      if (!cancelled) setConflicts(data ?? []);
    });
    return () => { cancelled = true; };
  }, [driver, when, ride?.id]);

  // Sugere o repasse conforme o cadastro do motorista (operador não vê a taxa, só o resultado)
  useEffect(() => {
    if (!driver || payoutEdited) return;
    const cents = parseBRLToCents(price);
    if (cents <= 0) return;
    let cancelled = false;
    createClient().rpc("suggest_payout", { p_driver: driver, p_price_cents: cents }).then(({ data }) => {
      if (!cancelled && typeof data === "number") setPayout(centsToInput(data));
    });
    return () => { cancelled = true; };
  }, [driver, price, payoutEdited]);

  const shown = driver && when ? conflicts : [];

  return (
    <div className="max-w-3xl space-y-4">
    {!ride && (
      <div className="card space-y-2">
        <label className="label" htmlFor="paste">Colar mensagem (e-mail ou WhatsApp)</label>
        <textarea id="paste" rows={4} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole aqui o texto do pedido e a IA preenche os campos abaixo." className="input" />
        <div className="flex items-center gap-3">
          <button type="button" onClick={readMessage} disabled={reading || paste.trim().length < 10} className="btn-secondary">{reading ? "Lendo…" : "Preencher com IA"}</button>
          {aiMsg && <span role="status" className="text-sm text-slate-600 dark:text-slate-300">{aiMsg}</span>}
        </div>
      </div>
    )}
    <ActionForm action={saveRide} submitLabel={ride ? "Salvar alterações" : "Salvar corrida"} className="card space-y-4">
      {ride?.id && <input type="hidden" name="id" value={ride.id} />}
      {!ride && <input type="hidden" name="source" value={src} />}
      {!ride && inboundId && <input type="hidden" name="inbound_id" value={inboundId} />}
      {!ride && raw && <input type="hidden" name="source_raw_message" value={raw} />}
      <div key={rev} className="grid gap-4 md:grid-cols-2">
        <Field label="Passageiro *"><input name="passenger_name" required autoFocus defaultValue={ride?.passenger_name ?? fill?.passenger_name} className="input" /></Field>
        <Field label="Telefone do passageiro"><input name="passenger_phone" inputMode="tel" defaultValue={ride?.passenger_phone ?? fill?.passenger_phone ?? ""} className="input" /></Field>
        <Field label="Origem *"><input name="origin" required defaultValue={ride?.origin ?? fill?.origin} className="input" /></Field>
        <Field label="Destino *"><input name="destination" required defaultValue={ride?.destination ?? fill?.destination} className="input" /></Field>
        <Field label="Data e horário *"><input name="scheduled_at" type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} className="input" /></Field>
        <Field label="Cliente (empresa)">
          <select name="client_id" defaultValue={ride?.client_id ?? matchedClient} className="input">
            <option value="">— sem cliente —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Valor da corrida (R$) *"><input name="price" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" className="input" /></Field>
        <Field label="Repasse ao motorista (R$) *" hint={payoutEdited ? undefined : "Calculado automaticamente ao escolher o motorista"}>
          <input name="payout" required inputMode="decimal" value={payout} onChange={(e) => { setPayout(e.target.value); setPayoutEdited(true); }} placeholder="0,00" className="input" />
        </Field>
      </div>
      <Field label="Motorista (envia a corrida na hora)">
        <select name="driver_id" value={driver} onChange={(e) => setDriver(e.target.value)} className="input">
          <option value="">— decidir depois —</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} {d.hint}</option>)}
        </select>
      </Field>
      {shown.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          ⚠ Este motorista já tem corrida próxima desse horário: {shown.map((c) => `${c.passenger_name} (${formatDateTime(c.scheduled_at)})`).join("; ")}.
        </div>
      )}
      <Field label="Observações"><textarea key={`n${rev}`} name="notes" rows={3} defaultValue={ride?.notes ?? fill?.notes ?? ""} className="input" /></Field>
    </ActionForm>
    </div>
  );
}
