"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LayoutDashboard, Car, Users, UserCog, Repeat, Wallet, BarChart3, Inbox, ScrollText, Settings, UserCheck, Moon, Sun, LogOut } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/labels";

const items = [
  { href: "/painel", label: "Painel", icon: LayoutDashboard },
  { href: "/corridas", label: "Corridas", icon: Car },
  { href: "/entrada", label: "Entrada", icon: Inbox },
  { href: "/recorrentes", label: "Recorrentes", icon: Repeat },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/motoristas", label: "Motoristas", icon: UserCog },
  { href: "/financeiro", label: "Financeiro", icon: Wallet, adminOnly: true },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3, adminOnly: true },
  { href: "/usuarios", label: "Usuários", icon: UserCheck, adminOnly: true },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText, adminOnly: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

export function Sidebar({ name, role }: { name: string; role: string }) {
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const visible = items.filter((i) => !i.adminOnly || role === "admin");
  return (
    <aside className="border-b border-slate-200 bg-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between p-3 md:block md:p-4">
        <div>
          <div className="text-lg font-bold">Base de Corridas</div>
          <div className="text-xs text-slate-500">{name} · {ROLE_LABEL[role]}</div>
        </div>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:px-3">
        {visible.map(({ href, label, icon: Icon }) => {
          const active = path.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-base ${active ? "bg-blue-600 text-white" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              <Icon size={18} /> {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex gap-2 p-3 md:absolute md:bottom-0 md:w-full">
        <button className="btn-secondary flex-1" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="Alternar tema">
          {resolvedTheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <form action={logout} className="flex-1">
          <button className="btn-secondary w-full" aria-label="Sair"><LogOut size={18} /> Sair</button>
        </form>
      </div>
    </aside>
  );
}
