"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";

function urlBase64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type St = "loading" | "unconfigured" | "unsupported" | "denied" | "off" | "on";

export function PushToggle() {
  const [state, setState] = useState<St>("loading");
  const [busy, setBusy] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!vapid) {
      Promise.resolve().then(() => setState("unconfigured"));
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      Promise.resolve().then(() => setState("unsupported"));
      return;
    }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (Notification.permission === "denied") setState("denied");
      else setState(sub ? "on" : "off");
    }).catch(() => setState("unsupported"));
  }, [vapid]);

  async function enable() {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("denied"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid!) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error();
      setState("on");
    } catch {
      setState("off");
      alert("Não foi possível ativar as notificações. Tente novamente.");
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true);
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
    setBusy(false);
  }

  if (state === "loading") return null;
  if (state === "unconfigured") return <p className="text-sm text-slate-500">A base ainda não configurou as notificações.</p>;
  if (state === "unsupported") return <p className="text-sm text-slate-500">Notificações não disponíveis neste aparelho. No iPhone, instale o app na tela inicial primeiro.</p>;
  if (state === "denied") return <p className="text-sm text-amber-700 dark:text-amber-400">Notificações bloqueadas. Libere nas configurações do navegador.</p>;
  return state === "on" ? (
    <button className="btn-secondary w-full" onClick={disable} disabled={busy}><BellOff size={18} /> Desativar notificações</button>
  ) : (
    <button className="btn-primary w-full" onClick={enable} disabled={busy}><Bell size={18} /> Ativar notificações</button>
  );
}
