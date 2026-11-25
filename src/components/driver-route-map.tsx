"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { RouteMapView, type MapPoint } from "@/components/route-map-view";

const point = z.tuple([z.number(), z.number()]);
const responseSchema = z.object({
  coordinates: z.array(point).min(2),
  destination: z.string(),
  summary: z.object({ distance: z.number(), duration: z.number() }),
});
type Route = z.infer<typeof responseSchema>;

const demoRoute: Route = {
  coordinates: [[-46.6333, -23.5505], [-46.60, -23.53], [-46.57, -23.51]],
  destination: "Destino ilustrativo",
  summary: { distance: 8000, duration: 900 },
};

export function DriverRouteMap({ rideId, demo = false }: { rideId?: string; demo?: boolean }) {
  const [route, setRoute] = useState<Route | null>(null);
  const [position, setPosition] = useState<MapPoint | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const watcher = useRef<number | null>(null);
  const active = useRef(true);
  const pending = useRef(false);
  const tileUrl = demo ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png" : process.env.NEXT_PUBLIC_MAP_TILE_URL;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
    };
  }, []);

  function close() {
    if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
    watcher.current = null;
    setRoute(null);
    setPosition(null);
    setError("");
  }

  async function showRoute() {
    if (pending.current) return;
    if (demo) {
      setPosition(demoRoute.coordinates[0]);
      setRoute(demoRoute);
      return;
    }
    if (!tileUrl?.startsWith("https://") || !["{z}", "{x}", "{y}"].every((part) => tileUrl.includes(part))) {
      setError("O serviço de imagens do mapa ainda não está configurado. Use Google Maps ou Waze.");
      return;
    }
    if (!rideId || !navigator.geolocation) {
      setError("A localização não está disponível neste dispositivo.");
      return;
    }
    pending.current = true;
    setLoading(true);
    setError("");
    try {
      const current = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }));
      if (!active.current) return;
      const currentPoint: MapPoint = [current.coords.longitude, current.coords.latitude];
      const response = await fetch("/api/motorista/rota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rideId, longitude: currentPoint[0], latitude: currentPoint[1] }),
      });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Não foi possível consultar a rota. Entre novamente e tente outra vez.");
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = z.object({ error: z.string() }).safeParse(data);
        throw new Error(message.success ? message.data.error : "Não foi possível calcular a rota.");
      }
      const parsed = responseSchema.safeParse(data);
      if (!parsed.success) throw new Error("A resposta do serviço de rotas é inválida.");
      if (!active.current) return;
      setPosition(currentPoint);
      setRoute(parsed.data);
      if (watcher.current !== null) navigator.geolocation.clearWatch(watcher.current);
      watcher.current = navigator.geolocation.watchPosition(
        (update) => setPosition([update.coords.longitude, update.coords.latitude]),
        () => setError("A localização deixou de estar disponível. Verifique a permissão do aparelho."),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 30000 },
      );
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : "Não foi possível obter sua localização. Verifique a permissão do aparelho.");
    } finally {
      pending.current = false;
      if (active.current) setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {!route && !demo && <p className="text-sm text-slate-500">Ao abrir o mapa, sua localização e o destino serão enviados ao openrouteservice; a área exibida será carregada do fornecedor de mapas.</p>}
      {route && position && <>
        {tileUrl && <RouteMapView coordinates={route.coordinates} position={position} tileUrl={tileUrl} attribution={demo ? "" : process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION ?? ""} />}
        {demo ? <p className="text-sm text-amber-700">Mapa ilustrativo: a linha não representa uma rota real.</p> :
          <p className="text-sm text-slate-500">Destino encontrado: {route.destination}. Confira o endereço. Trajeto inicial: {(route.summary.distance / 1000).toFixed(1)} km, cerca de {Math.ceil(route.summary.duration / 60)} min.</p>}
        {!demo && <p className="text-sm text-slate-500">Sua posição atualiza enquanto este mapa estiver aberto. Para recalcular o trajeto, toque no botão abaixo. Não há instruções de navegação por voz.</p>}
      </>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button type="button" className="btn-secondary w-full" onClick={showRoute} disabled={loading}>
        {loading ? "Calculando rota..." : route ? "Recalcular rota" : "Abrir mapa da rota"}
      </button>
      {route && <button type="button" className="btn-secondary w-full" onClick={close} disabled={loading}>Fechar mapa</button>}
    </div>
  );
}
