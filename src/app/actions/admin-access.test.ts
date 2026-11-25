import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  getClaims: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(() => { throw new Error("REDIRECT"); }),
}));
vi.mock("@/lib/auth", () => ({ requireStaff: mocks.requireStaff }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getClaims: mocks.getClaims } }) }));
vi.mock("@/lib/jobs", () => ({ adminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

import { unlockAdmin } from "./admin-access";
const id = "00000000-0000-4000-8000-000000000001";
const session = "10000000-0000-4000-8000-000000000001";
const password = "uma-senha-para-teste";
function form(value: string) { const fd = new FormData(); fd.set("password", value); return fd; }

describe("senha administrativa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const salt = randomBytes(16);
    vi.stubEnv("ADMIN_SESSION_ACCESS_ENABLED", "1");
    vi.stubEnv("ADMIN_ACCESS_PASSWORD_HASH", `scrypt:${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`);
    mocks.requireStaff.mockResolvedValue({ id });
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: id, session_id: session } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => name === "rate_limit_hit" ? { data: true, error: null } : { error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("libera apenas a sessão autenticada após a senha correta", async () => {
    await expect(unlockAdmin(undefined, form(password))).rejects.toThrow("REDIRECT");
    expect(mocks.rpc).toHaveBeenCalledWith("grant_admin_session", { p_user: id, p_session: session });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("não libera com senha incorreta ou limite de tentativas excedido", async () => {
    expect((await unlockAdmin(undefined, form("errada")))?.error).toContain("incorreta");
    expect(mocks.rpc).not.toHaveBeenCalledWith("grant_admin_session", expect.anything());
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    expect((await unlockAdmin(undefined, form(password)))?.error).toContain("Muitas tentativas");
    expect(mocks.rpc).not.toHaveBeenCalledWith("grant_admin_session", expect.anything());
  });

  it("falha fechada quando a configuração ou a sessão é inválida", async () => {
    vi.stubEnv("ADMIN_ACCESS_PASSWORD_HASH", "");
    expect((await unlockAdmin(undefined, form(password)))?.error).toContain("não está configurada");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
