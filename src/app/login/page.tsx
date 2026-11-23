"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login, signup } from "@/app/actions/auth";

export default function LoginPage() {
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState(login, undefined);
  const [signState, signAction, signPending] = useActionState(signup, undefined);
  const tabCls = (t: string) => `flex-1 rounded-lg px-3 py-2 text-center font-semibold ${tab === t ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <h1 className="mb-1 text-3xl font-bold">Base de Corridas</h1>
      <p className="mb-4 text-slate-500">{tab === "login" ? "Entre com seu e-mail e senha." : "Crie seu cadastro e entre na hora."}</p>
      <div role="tablist" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={tab === "login"} onClick={() => setTab("login")} className={tabCls("login")}>Entrar</button>
        <button type="button" role="tab" aria-selected={tab === "signup"} onClick={() => setTab("signup")} className={tabCls("signup")}>Criar cadastro</button>
      </div>
      {tab === "login" ? (
        <form action={loginAction} className="card space-y-4">
          <div>
            <label className="label" htmlFor="email">E-mail</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">Senha</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          {loginState?.error && <p role="alert" className="text-sm text-red-600">{loginState.error}</p>}
          <button className="btn-primary w-full" disabled={loginPending}>{loginPending ? "Entrando..." : "Entrar"}</button>
          <Link href="/recuperar-senha" className="block text-center text-sm text-blue-600 hover:underline">Esqueci minha senha</Link>
        </form>
      ) : (
        <form action={signAction} className="card space-y-4">
          <div>
            <label className="label" htmlFor="full_name">Nome completo</label>
            <input id="full_name" name="full_name" required minLength={3} autoComplete="name" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s_email">E-mail</label>
            <input id="s_email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s_password">Senha (mínimo 8 caracteres)</label>
            <input id="s_password" name="password" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s_confirm">Confirmar senha</label>
            <input id="s_confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input" />
          </div>
          {signState?.error && <p role="alert" className="text-sm text-red-600">{signState.error}</p>}
          {signState?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{signState.ok}</p>}
          <button className="btn-primary w-full" disabled={signPending}>{signPending ? "Enviando..." : "Criar cadastro"}</button>
        </form>
      )}
    </main>
  );
}
