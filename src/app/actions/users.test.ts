import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  return {
    query,
    requireAdmin: vi.fn(),
    from: vi.fn(() => query),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateUser } from "./users";

const admin = "00000000-0000-4000-8000-000000000001";
const target = "00000000-0000-4000-8000-000000000002";
function form(id = target) {
  const fd = new FormData();
  fd.set("id", id);
  fd.set("role", "operator");
  fd.set("active", "true");
  return fd;
}

describe("aprovação de acesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: admin });
    mocks.query.maybeSingle.mockResolvedValue({ data: { id: target }, error: null });
  });

  it("aplica a aprovação no banco e atualiza ambas as telas", async () => {
    expect(await updateUser(undefined, form())).toEqual({ ok: "Acesso aprovado." });
    expect(mocks.query.update).toHaveBeenCalledWith({ active: true, role: "operator" });
    expect(mocks.query.eq).toHaveBeenCalledWith("active", false);
    expect(mocks.query.neq).toHaveBeenCalledWith("role", "driver");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/administrador");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/usuarios");
  });

  it("não permite que outros perfis ou o próprio administrador alterem o acesso", async () => {
    mocks.requireAdmin.mockRejectedValueOnce(new Error("Sem permissão"));
    await expect(updateUser(undefined, form())).rejects.toThrow("Sem permissão");
    expect(await updateUser(undefined, form(admin))).toEqual({ error: "Você não pode alterar seu próprio acesso." });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("não informa sucesso quando o banco falha ou a conta já mudou", async () => {
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await updateUser(undefined, form()))?.error).toContain("Não foi possível");
    mocks.query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect((await updateUser(undefined, form()))?.error).toContain("já foi alterado");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
