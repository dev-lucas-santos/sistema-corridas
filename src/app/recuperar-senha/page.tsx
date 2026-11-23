"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestReset } from "@/app/actions/auth";

export default function Page() {
  const [state, action, pending] = useActionState(requestReset, undefined);
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 text-2xl font-bold">Recuperar senha</h1>
      <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">Seu e-mail</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        {state?.ok && <p className="text-sm text-green-700">{state.ok}</p>}
        <button className="btn-primary w-full" disabled={pending}>Enviar link</button>
        <Link href="/login" className="block text-center text-sm text-blue-600 hover:underline">Voltar ao login</Link>
      </form>
    </main>
  );
}
