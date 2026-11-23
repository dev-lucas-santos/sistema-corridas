"use client";

import { useActionState } from "react";
import { updatePassword } from "@/app/actions/auth";

export default function Page() {
  const [state, action, pending] = useActionState(updatePassword, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold">Nova senha</h1>
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="password">Nova senha (mín. 8 caracteres)</label>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repita a senha</label>
          <input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>Salvar senha</button>
      </form>
    </main>
  );
}
