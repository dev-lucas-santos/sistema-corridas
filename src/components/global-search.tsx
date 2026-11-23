"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Hit = { kind: string; id: string; title: string; subtitle: string };
const HREF: Record<string, string> = { ride: "/corridas", client: "/clientes", driver: "/motoristas" };
const KIND: Record<string, string> = { ride: "Corrida", client: "Cliente", driver: "Motorista" };

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc("global_search", { q: term });
      setHits((data as Hit[]) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const visible = q.trim().length >= 2 ? hits : [];

  return (
    <div className="relative mx-auto max-w-xl">
      <Search className="absolute left-3 top-3 text-slate-400" size={18} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar passageiro, telefone, cliente ou motorista..."
        className="input pl-10" aria-label="Busca rápida" />
      {visible.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {visible.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <Link href={`${HREF[h.kind]}/${h.id}`} onClick={() => setQ("")} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                <span><span className="font-medium">{h.title}</span> <span className="text-sm text-slate-500">{h.subtitle}</span></span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-xs dark:bg-slate-700">{KIND[h.kind]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
