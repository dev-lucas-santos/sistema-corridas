"use client";

import Link from "next/link";
import { Suspense, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import { loginDriver, signupDriver } from "@/app/actions/auth";

function ConfirmationNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("conta") === "equipe") return <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">Este navegador está conectado à conta da base. Entre com uma conta de motorista. Para usar as duas contas ao mesmo tempo, use outro navegador ou perfil.</p>;
  return searchParams.get("confirmacao") === "entrar" ? <p role="status" className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950 dark:text-blue-300">Se o e-mail foi confirmado, entre com sua senha. Se não conseguir, solicite ajuda à base.</p> : null;
}

export default function LoginMotorista() {
  const [state, action, pending] = useActionState(loginDriver, undefined);
  const [signupState, signupAction, signupPending] = useActionState(signupDriver, undefined);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const tabClass = (name: "login" | "signup") => `flex-1 rounded-lg px-3 py-2 font-semibold ${tab === name ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-5">
      <h1 className="text-3xl font-bold">App do motorista</h1>
      <p className="mb-5 mt-2 text-sm text-slate-500">{tab === "login" ? "Entre para acompanhar suas corridas." : "Crie sua conta e confirme seu e-mail."}</p>
      <Suspense fallback={null}><ConfirmationNotice /></Suspense>
      <div role="tablist" aria-label="Acesso do motorista" className="mb-4 flex gap-2">
        <button type="button" role="tab" aria-selected={tab === "login"} className={tabClass("login")} onClick={() => setTab("login")}>Entrar</button>
        <button type="button" role="tab" aria-selected={tab === "signup"} className={tabClass("signup")} onClick={() => setTab("signup")}>Cadastre-se</button>
      </div>
      {tab === "login" ? <form action={action} className="card space-y-4">
        <div>
          <label className="label" htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        {state?.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Entrando..." : "Entrar"}</button>
        <Link href="/recuperar-senha" className="block text-center text-sm text-blue-600 underline">Esqueci minha senha</Link>
      </form> : <form action={signupAction} className="card space-y-4">
        <p className="text-sm text-slate-500">Após confirmar o e-mail, você poderá entrar. A base vinculará seu cadastro às corridas.</p>
        <div>
          <label className="label" htmlFor="signup-name">Nome completo</label>
          <input id="signup-name" name="full_name" required minLength={3} maxLength={120} autoComplete="name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="signup-email">E-mail</label>
          <input id="signup-email" name="email" type="email" required autoComplete="email" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="signup-password">Senha (mínimo 8 caracteres)</label>
          <input id="signup-password" name="password" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="signup-confirm">Confirmar senha</label>
          <input id="signup-confirm" name="confirm" type="password" required minLength={8} maxLength={72} autoComplete="new-password" className="input" />
        </div>
        {signupState?.error && <p role="alert" className="text-sm text-red-600">{signupState.error}</p>}
        {signupState?.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">{signupState.ok}</p>}
        <button className="btn-primary w-full" disabled={signupPending}>{signupPending ? "Enviando..." : "Criar conta"}</button>
      </form>}
    </main>
  );
}
