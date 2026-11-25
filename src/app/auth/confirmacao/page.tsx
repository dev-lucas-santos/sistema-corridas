import Link from "next/link";

export default function ConfirmacaoInvalida() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-5">
      <h1 className="text-2xl font-bold">Não foi possível confirmar o e-mail</h1>
      <p className="text-slate-500">O link pode estar vencido ou já ter sido utilizado. Se necessário, entre em contato com a base.</p>
      <Link href="/motorista/login" className="btn-primary">Login do motorista</Link>
      <Link href="/login" className="btn-secondary">Login da base</Link>
    </main>
  );
}
