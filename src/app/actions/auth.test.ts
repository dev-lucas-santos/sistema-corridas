import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn() };
  return {
    query,
    signIn: vi.fn(),
    signOut: vi.fn(),
    setSession: vi.fn(),
    redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut }, from: () => mocks.query }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { setSession: mocks.setSession } }) }));
vi.mock("@/lib/inbound-server", () => ({ withinRateLimit: async () => true }));
vi.mock("@/lib/jobs", () => ({ adminClient: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { loginDriver } from "./auth";

function form() {
  const fd = new FormData();
  fd.set("email", "driver@example.test");
  fd.set("password", "password");
  return fd;
}

describe("entrada do motorista", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ data: {
      user: { id: "driver", email_confirmed_at: "2026-01-01" },
      session: { access_token: "access", refresh_token: "refresh" },
    }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.query.single.mockResolvedValue({ data: { role: "driver", active: true }, error: null });
  });

  it("abre o painel do motorista apenas para sua conta ativa", async () => {
    await expect(loginDriver(undefined, form())).rejects.toThrow("redirect:/motorista");
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
  });

  it("recusa a conta da base sem substituir a sessão existente", async () => {
    mocks.query.single.mockResolvedValue({ data: { role: "operator", active: true }, error: null });
    expect((await loginDriver(undefined, form()))?.error).toContain("conta é da base");
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("não inicia sessão para motorista inativo ou sem confirmação", async () => {
    mocks.query.single.mockResolvedValue({ data: { role: "driver", active: false }, error: null });
    expect((await loginDriver(undefined, form()))?.error).toContain("inativo");
    mocks.query.single.mockResolvedValue({ data: { role: "driver", active: true }, error: null });
    mocks.signIn.mockResolvedValue({ data: {
      user: { id: "driver", email_confirmed_at: null },
      session: { access_token: "access", refresh_token: "refresh" },
    }, error: null });
    expect((await loginDriver(undefined, form()))?.error).toContain("Confirme seu e-mail");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});
