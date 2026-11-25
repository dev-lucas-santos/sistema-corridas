import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn() };
  return { query, profile: vi.fn(), from: vi.fn(() => query), rpc: vi.fn() };
});
vi.mock("@/lib/auth", () => ({ getProfile: mocks.profile }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/jobs", () => ({ adminClient: () => ({ rpc: mocks.rpc }) }));

import { POST } from "./route";

const rideId = "20000000-0000-4000-8000-000000000001";
function request() {
  return new Request("http://localhost/api/motorista/rota", { method: "POST", body: JSON.stringify({ rideId, longitude: -46.6, latitude: -23.5 }) });
}

describe("rota do motorista", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "test-key");
    mocks.profile.mockResolvedValue({ id: "driver", role: "driver", active: true });
    mocks.query.maybeSingle
      .mockResolvedValueOnce({ data: { id: "driver-id", active: true }, error: null })
      .mockResolvedValueOnce({ data: { destination: "Destino de teste", status: "confirmed" }, error: null })
      .mockResolvedValueOnce({ data: { id: "assignment" }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("nega acesso de equipe e corridas ainda não aceitas sem consultar o serviço", async () => {
    mocks.profile.mockResolvedValueOnce({ role: "operator", active: true });
    expect((await POST(request())).status).toBe(403);
    mocks.query.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: "driver-id", active: true }, error: null })
      .mockResolvedValueOnce({ data: { destination: "Destino", status: "confirmed" }, error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request())).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("informa que falta configuração sem consultar o provedor", async () => {
    vi.stubEnv("OPENROUTESERVICE_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("não está configurado");
  });

  it("retorna o trajeto e o endereço encontrado de uma corrida aceita", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [{ geometry: { coordinates: [-46.5, -23.4] }, properties: { label: "Destino de teste" } }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ features: [{ geometry: { type: "LineString", coordinates: [[-46.6, -23.5], [-46.5, -23.4]] }, properties: { summary: { distance: 1000, duration: 120 } } }] })));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ destination: "Destino de teste", coordinates: [[-46.6, -23.5], [-46.5, -23.4]] });
    expect(JSON.parse(fetch.mock.calls[1][1].body).coordinates).toEqual([[-46.6, -23.5], [-46.5, -23.4]]);
  });

  it("não apresenta rota quando o endereço não é encontrado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ features: [] }))));
    expect((await POST(request())).status).toBe(422);
  });
});
