import { requireAdmin } from "@/lib/auth";

export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return children;
}
