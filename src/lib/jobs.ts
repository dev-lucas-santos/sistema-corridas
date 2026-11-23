import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { aiConfigured, extractRide } from "@/lib/ai/extract";
import { todayBR } from "@/lib/dates";
import { sendEmail } from "@/lib/email";
import { appendRow, sheetTab, sheetsConfigured } from "@/lib/google/sheets";
import { buildWorkbook, fetchRides } from "@/lib/reports/data";
import { dueRange, type Frequency } from "@/lib/reports/period";
import { HEADERS, RIDE_SELECT, rideToRow, summarize, type ReportRide } from "@/lib/reports/rows";
import { formatBRL } from "@/lib/money";

const MAX_ATTEMPTS = 5;
const TIME_BUDGET_MS = 45_000;
const FREQ_LABEL: Record<Frequency, string> = { daily: "diário", weekly: "semanal", monthly: "mensal" };

export function adminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

const brHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(new Date())) % 24;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtDay = (d: string) => d.split("-").reverse().join("/");

/** Enfileira os relatórios cujo horário já passou hoje. O "claim" por last_sent_on impede envio duplicado. */
export async function enqueueDueReports(admin: SupabaseClient, today = todayBR(), hour = brHour()) {
  const { data: schedules } = await admin.from("report_schedules").select("id, frequency")
    .eq("active", true).lte("send_hour", hour).or(`last_sent_on.is.null,last_sent_on.lt.${today}`);
  let queued = 0;
  for (const s of schedules ?? []) {
    const range = dueRange(s.frequency as Frequency, today);
    if (!range) continue;
    const { data: claimed } = await admin.from("report_schedules").update({ last_sent_on: today })
      .eq("id", s.id).or(`last_sent_on.is.null,last_sent_on.lt.${today}`).select("id");
    if (!claimed?.length) continue;
    await admin.from("jobs").insert({ type: "report_email", payload: { schedule_id: s.id, ...range } });
    queued++;
  }
  return queued;
}

type Job = { id: number; type: string; payload: Record<string, unknown>; attempts: number };

async function sheetsRide(admin: SupabaseClient, job: Job) {
  if (!sheetsConfigured()) return "Google Sheets não configurado; corrida ficará para a sincronização manual.";
  const rideId = String(job.payload.ride_id);
  const { data: ride } = await admin.from("rides").select(RIDE_SELECT).eq("id", rideId).single();
  if (!ride || (ride as unknown as ReportRide).status !== "completed") return "Corrida não está realizada; ignorada.";
  if ((await admin.from("sheets_sync").select("ride_id").eq("ride_id", rideId).maybeSingle()).data) return null;

  const r = ride as unknown as ReportRide;
  const row = rideToRow(r);
  const steps = new Set<string>((job.payload.steps as string[] | undefined) ?? []);
  const targets: [string, string][] = [["main", "Consolidado"]];
  if (r.drivers) targets.push(["driver", sheetTab("Motorista", r.drivers.full_name)]);
  if (r.clients) targets.push(["client", sheetTab("Cliente", r.clients.legal_name)]);
  for (const [step, tab] of targets) {
    if (steps.has(step)) continue;
    try {
      await appendRow(tab, HEADERS, row);
    } catch (e) {
      // guarda o progresso para a nova tentativa não duplicar linhas já gravadas
      await admin.from("jobs").update({ payload: { ...job.payload, steps: [...steps] } }).eq("id", job.id);
      throw e;
    }
    steps.add(step);
  }
  await admin.from("sheets_sync").upsert({ ride_id: rideId });
  return null;
}

async function inboundExtract(admin: SupabaseClient, job: Job, lastAttempt: boolean) {
  const id = String(job.payload.message_id);
  const { data: m } = await admin.from("inbound_messages").select("subject, body, status").eq("id", id).single();
  if (!m || m.status !== "received") return "Mensagem já tratada.";
  if (!aiConfigured()) {
    await admin.from("inbound_messages").update({ status: "ready" }).eq("id", id);
    return "IA não configurada; mensagem disponível para cadastro manual.";
  }
  try {
    const extracted = await extractRide([m.subject, m.body].filter(Boolean).join("\n\n"), todayBR());
    await admin.from("inbound_messages").update({ status: "ready", extracted }).eq("id", id);
  } catch (e) {
    // na última tentativa a mensagem segue para a caixa de entrada sem dados extraídos
    if (lastAttempt) await admin.from("inbound_messages").update({ status: "failed" }).eq("id", id);
    throw e;
  }
  return null;
}

async function reportEmail(admin: SupabaseClient, job: Job) {
  const { schedule_id, start, end } = job.payload as { schedule_id: string; start: string; end: string };
  const { data: s } = await admin.from("report_schedules").select("name, frequency, recipients, active").eq("id", schedule_id).single();
  if (!s || !s.active) return "Agendamento removido ou inativo.";
  const { rides, truncated } = await fetchRides(admin, { from: start, to: end });
  const t = summarize(rides);
  const period = start === end ? fmtDay(start) : `${fmtDay(start)} a ${fmtDay(end)}`;
  const row = (l: string, v: string) => `<tr><td style="padding:4px 12px 4px 0">${l}</td><td><b>${v}</b></td></tr>`;
  await sendEmail({
    to: s.recipients,
    subject: `Relatório ${FREQ_LABEL[s.frequency as Frequency]} — ${period}`,
    html: `<p>${esc(s.name)} · ${period}</p><table>${row("Corridas realizadas", String(t.completed))}${row("Canceladas", String(t.cancelled))}${row("Faturado", formatBRL(t.revenue))}${row("Repasse aos motoristas", formatBRL(t.payout))}${row("Margem da base", formatBRL(t.margin))}</table>${truncated ? "<p>Atenção: planilha limitada a 50.000 linhas.</p>" : ""}<p>Planilha completa em anexo.</p>`,
    attachments: [{ filename: `relatorio_${start}_a_${end}.xlsx`, content: await buildWorkbook(rides) }],
  });
  return null;
}

/** Processa a fila. Falhas voltam à fila com espera crescente; após MAX_ATTEMPTS ficam como "failed". */
export async function processJobs(admin: SupabaseClient, limit = 20) {
  const t0 = Date.now();
  const { data: jobs, error } = await admin.rpc("claim_jobs", { p_limit: limit });
  if (error) throw new Error(error.message);
  let done = 0, failed = 0;
  for (const job of (jobs ?? []) as Job[]) {
    if (Date.now() - t0 > TIME_BUDGET_MS) {
      await admin.from("jobs").update({ status: "pending", attempts: Math.max(0, job.attempts - 1) }).eq("id", job.id);
      continue;
    }
    try {
      const note = job.type === "sheets_ride" ? await sheetsRide(admin, job)
        : job.type === "report_email" ? await reportEmail(admin, job)
        : job.type === "inbound_extract" ? await inboundExtract(admin, job, job.attempts >= MAX_ATTEMPTS)
        : "Tipo desconhecido";
      await admin.from("jobs").update({ status: "done", finished_at: new Date().toISOString(), last_error: note }).eq("id", job.id);
      done++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const final = job.attempts >= MAX_ATTEMPTS;
      await admin.from("jobs").update({
        status: final ? "failed" : "pending", last_error: msg.slice(0, 500),
        run_at: new Date(Date.now() + job.attempts * 5 * 60_000).toISOString(),
        finished_at: final ? new Date().toISOString() : null,
      }).eq("id", job.id);
      failed++;
    }
  }
  return { done, failed };
}
