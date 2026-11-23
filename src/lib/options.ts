import { createClient } from "@/lib/supabase/server";

export async function loadOptions() {
  const supabase = await createClient();
  const [c, d] = await Promise.all([
    supabase.from("clients").select("id, legal_name").eq("active", true).order("legal_name").limit(500),
    supabase.from("drivers").select("id, full_name, availability").eq("active", true).order("full_name").limit(500),
  ]);
  const label: Record<string, string> = { online: "🟢", busy: "🟡", offline: "⚪" };
  return {
    clients: (c.data ?? []).map((x) => ({ id: x.id, name: x.legal_name })),
    drivers: (d.data ?? []).map((x) => ({ id: x.id, name: x.full_name, hint: label[x.availability] })),
  };
}
