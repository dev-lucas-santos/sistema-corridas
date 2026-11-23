"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABLES = ["rides", "drivers", "ride_assignments"];

// Atualiza a tela quando algo muda no banco. A RLS limita o que cada usuário recebe.
// `poll` força uma releitura periódica (usada para o alerta de motorista sem resposta).
export function RealtimeRefresh({ tables = TABLES, poll }: { tables?: string[]; poll?: number }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };
    let channel = supabase.channel(`refresh-${tables.join("-")}`);
    for (const table of tables) channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    const onVisible = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVisible);
    const interval = poll ? setInterval(() => router.refresh(), poll) : null;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router, tables, poll]);

  return null;
}
