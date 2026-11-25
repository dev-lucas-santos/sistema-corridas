"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions/auth";

export function ActionForm({
  action, children, submitLabel = "Salvar", className = "space-y-4", buttonClassName = "btn-primary",
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{state.error}</p>}
      {state?.ok && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{state.ok}</p>}
      <button className={buttonClassName} disabled={pending}>{pending ? "Salvando..." : submitLabel}</button>
    </form>
  );
}
