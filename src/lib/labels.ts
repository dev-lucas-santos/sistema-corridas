export const RIDE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  scheduled: { label: "Agendada", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  confirmed: { label: "Confirmada", cls: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" },
  in_progress: { label: "Em andamento", cls: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" },
  completed: { label: "Realizada", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  cancelled: { label: "Cancelada", cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
};

export const ASSIGNMENT_STATUS: Record<string, string> = {
  sent: "Enviada", accepted: "Aceita", declined: "Recusada", expired: "Expirada", cancelled: "Cancelada",
};

export const AVAILABILITY: Record<string, { label: string; cls: string }> = {
  online: { label: "Online", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  busy: { label: "Ocupado", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  offline: { label: "Offline", cls: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
};

export const ROLE_LABEL: Record<string, string> = { admin: "Administrador", operator: "Operador", driver: "Motorista" };

export const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  partial: { label: "Pago parcialmente", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  paid: { label: "Pago", cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
};
export const PERIOD_LABEL: Record<string, string> = { weekly: "Semanal", biweekly: "Quinzenal", monthly: "Mensal" };
