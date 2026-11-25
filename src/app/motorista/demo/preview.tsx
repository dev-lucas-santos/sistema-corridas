"use client";

import { useState } from "react";
import { MapPin, MessageCircle } from "lucide-react";
import { DriverRouteMap } from "@/components/driver-route-map";

type Screen = "corridas" | "mensagens" | "historico" | "financeiro" | "telefone";
type RideStatus = "oferta" | "confirmada" | "em andamento" | "realizada" | "recusada";

export function DriverDemo() {
  const [screen, setScreen] = useState<Screen>("corridas");
  const [availability, setAvailability] = useState("Online");
  const [ride, setRide] = useState<RideStatus>("oferta");
  const [history, setHistory] = useState<"realizadas" | "canceladas">("realizadas");
  const [body, setBody] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  return (
    <main className="mx-auto max-w-md space-y-5 p-4 pb-16">
      <p role="status" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900">
        Demonstração local: dados fictícios. Nenhuma alteração ou mensagem é enviada à base.
      </p>
      {screen === "corridas" ? (
        <>
          <header>
            <h1 className="text-xl font-bold">Olá, Motorista</h1>
            <p className="text-sm text-slate-500">Você está: <b>{availability}</b></p>
          </header>
          <div className="grid grid-cols-3 gap-2">
            {["Online", "Ocupado", "Offline"].map((item) => (
              <button key={item} type="button" onClick={() => setAvailability(item)} className={availability === item ? "btn-primary" : "btn-secondary"}>{item}</button>
            ))}
          </div>
          <nav className="grid grid-cols-2 gap-2" aria-label="Menu do motorista">
            <button type="button" onClick={() => setScreen("mensagens")} className="btn-primary col-span-2"><MessageCircle size={18} /> Mensagens com a base</button>
            <button type="button" onClick={() => setScreen("historico")} className="btn-secondary">Histórico</button>
            <button type="button" onClick={() => setScreen("financeiro")} className="btn-secondary">Meu financeiro</button>
            <button type="button" onClick={() => setScreen("telefone")} className="btn-secondary col-span-2">Meu WhatsApp</button>
          </nav>
          {ride !== "realizada" && ride !== "recusada" && (
            <section className="space-y-3">
              <h2 className="font-semibold">{ride === "oferta" ? "Novas corridas (1)" : "Minhas corridas"}</h2>
              <div className="card space-y-4 border-blue-400">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-lg font-semibold">Passageiro de exemplo</p><p className="text-sm text-slate-500">Amanhã, 08:00</p></div>
                  <div className="text-right"><p className="text-lg font-bold text-green-700">R$ 75,00</p><p className="text-sm">{ride === "oferta" ? "Nova oferta" : ride}</p></div>
                </div>
                <p className="flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 text-green-600" /><span><b>Origem:</b> Centro</span></p>
                <p className="flex gap-2 text-sm"><MapPin size={16} className="mt-0.5 text-red-600" /><span><b>Destino:</b> Aeroporto</span></p>
                <button type="button" onClick={() => setScreen("mensagens")} className="btn-secondary w-full"><MessageCircle size={18} /> Mensagens com a base</button>
                {(ride === "confirmada" || ride === "em andamento") && <DriverRouteMap demo />}
                {ride === "oferta" && <><button type="button" onClick={() => setRide("confirmada")} className="btn-primary w-full">Aceitar corrida</button><button type="button" onClick={() => setRide("recusada")} className="btn-secondary w-full">Recusar corrida</button></>}
                {ride === "confirmada" && <button type="button" onClick={() => setRide("em andamento")} className="btn-primary w-full">Iniciar corrida</button>}
                {ride === "em andamento" && <button type="button" onClick={() => setRide("realizada")} className="btn-primary w-full">Finalizar corrida</button>}
              </div>
            </section>
          )}
          {ride === "oferta" && <section><h2 className="mb-3 font-semibold">Minhas corridas</h2><p className="card text-sm text-slate-500">Nenhuma corrida no momento.</p></section>}
          {(ride === "realizada" || ride === "recusada") && <button type="button" className="btn-secondary w-full" onClick={() => setRide("oferta")}>Reiniciar exemplo</button>}
        </>
      ) : (
        <>
          <button type="button" className="btn-secondary" onClick={() => setScreen("corridas")}>Voltar</button>
          {screen === "mensagens" && <>
            <h1 className="text-xl font-bold">Mensagens com a base</h1>
            <p className="text-sm text-slate-500">Exemplo de conversa com a equipe da base.</p>
            <div className="rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800"><b>Base</b><p>Olá! Estamos disponíveis para ajudar.</p></div>
            {messages.map((message, index) => <div key={index} className="ml-8 rounded-xl bg-blue-100 p-3 text-sm dark:bg-blue-950"><b>Você</b><p className="whitespace-pre-wrap break-words">{message}</p></div>)}
            <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (body.trim()) { setMessages([...messages, body.trim()]); setBody(""); } }}>
              <label className="label" htmlFor="demo-message">Sua mensagem</label>
              <textarea id="demo-message" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={2000} rows={3} className="input" />
              <button className="btn-primary">Enviar mensagem de exemplo</button>
            </form>
          </>}
          {screen === "historico" && <>
            <h1 className="text-xl font-bold">Histórico de corridas</h1>
            <nav className="grid grid-cols-2 gap-2" aria-label="Filtrar histórico">
              <button type="button" onClick={() => setHistory("realizadas")} className={history === "realizadas" ? "btn-primary" : "btn-secondary"}>Realizadas</button>
              <button type="button" onClick={() => setHistory("canceladas")} className={history === "canceladas" ? "btn-primary" : "btn-secondary"}>Canceladas</button>
            </nav>
            <p className="card text-sm">{history === "realizadas" ? "Corrida de exemplo · Centro → Aeroporto · R$ 75,00" : "Nenhuma corrida cancelada no exemplo."}</p>
          </>}
          {screen === "financeiro" && <><h1 className="text-xl font-bold">Meu financeiro</h1><p className="card text-sm">Exemplo: R$ 75,00 a receber.</p></>}
          {screen === "telefone" && <><h1 className="text-xl font-bold">Meu WhatsApp</h1><p className="card text-sm">Na conta real, você pode cadastrar e confirmar seu número aqui. Este exemplo não envia códigos.</p></>}
        </>
      )}
    </main>
  );
}
