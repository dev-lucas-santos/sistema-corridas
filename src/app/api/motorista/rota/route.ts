import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/jobs";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  rideId: z.string().uuid(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});
const coordinates = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
const geocodeSchema = z.object({
  features: z.array(z.object({
    geometry: z.object({ coordinates }),
    properties: z.object({ label: z.string().min(1) }),
  })).min(1),
});
const routeSchema = z.object({
  features: z.array(z.object({
    geometry: z.object({ type: z.literal("LineString"), coordinates: z.array(coordinates).min(2) }),
    properties: z.object({ summary: z.object({ distance: z.number().nonnegative(), duration: z.number().nonnegative() }) }),
  })).min(1),
});

export async function POST(request: Request) {
  const profile = await getProfile();
  if (!profile?.active || profile.role !== "driver") return NextResponse.json({ error: "Acesso não autorizado." }, { status: 403 });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 2000) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const key = process.env.OPENROUTESERVICE_API_KEY;
  if (!key) return NextResponse.json({ error: "O serviço de rotas ainda não está configurado. Use Google Maps ou Waze." }, { status: 503 });

  const supabase = await createClient();
  const { data: driver, error: driverError } = await supabase.from("drivers").select("id, active")
    .eq("profile_id", profile.id).maybeSingle();
  if (driverError) return NextResponse.json({ error: "Não foi possível verificar seu cadastro." }, { status: 503 });
  if (!driver?.active) return NextResponse.json({ error: "Motorista não encontrado ou inativo." }, { status: 403 });
  const [{ data: ride, error: rideError }, { data: assignment, error: assignmentError }] = await Promise.all([
    supabase.from("rides").select("destination, status").eq("id", parsed.data.rideId).eq("driver_id", driver.id).maybeSingle(),
    supabase.from("ride_assignments").select("id").eq("ride_id", parsed.data.rideId).eq("driver_id", driver.id).eq("status", "accepted").limit(1).maybeSingle(),
  ]);
  if (rideError || assignmentError) return NextResponse.json({ error: "Não foi possível verificar a corrida." }, { status: 503 });
  if (!ride || !assignment || !["confirmed", "in_progress"].includes(ride.status)) {
    return NextResponse.json({ error: "A rota está disponível somente para uma corrida aceita e em andamento." }, { status: 403 });
  }
  try {
    const { data: allowed, error } = await adminClient().rpc("rate_limit_hit", { p_key: `route:${profile.id}`, p_limit: 30, p_window_seconds: 3600 });
    if (error) throw new Error("Falha ao verificar limite");
    if (allowed !== true) return NextResponse.json({ error: "Limite de consultas atingido. Tente novamente mais tarde." }, { status: 429 });
    const query = new URL("https://api.openrouteservice.org/geocode/search");
    query.searchParams.set("api_key", key);
    query.searchParams.set("text", ride.destination);
    query.searchParams.set("size", "1");
    const geocodeResponse = await fetch(query, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!geocodeResponse.ok) throw new Error(`Geocodificação: HTTP ${geocodeResponse.status}`);
    const geocode = geocodeSchema.safeParse(await geocodeResponse.json());
    if (!geocode.success) return NextResponse.json({ error: "Destino não encontrado. Confira o endereço com a base." }, { status: 422 });
    const destination = geocode.data.features[0];
    const origin = [parsed.data.longitude, parsed.data.latitude];
    const routeResponse = await fetch("https://api.openrouteservice.org/v2/directions/driving-car/geojson", {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ coordinates: [origin, destination.geometry.coordinates] }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    if (!routeResponse.ok) throw new Error(`Rota: HTTP ${routeResponse.status}`);
    const route = routeSchema.safeParse(await routeResponse.json());
    if (!route.success) throw new Error("Resposta de rota inválida");
    return NextResponse.json({
      coordinates: route.data.features[0].geometry.coordinates,
      destination: destination.properties.label,
      summary: route.data.features[0].properties.summary,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Falha ao consultar o serviço de rotas ou o limite de consultas.");
    return NextResponse.json({ error: "Não foi possível calcular a rota agora. Tente novamente ou use Google Maps ou Waze." }, { status: 503 });
  }
}
