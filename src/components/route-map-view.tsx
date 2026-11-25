"use client";

import { useEffect, useRef } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPoint = [number, number];

export function RouteMapView({ coordinates, position, tileUrl, attribution }: { coordinates: MapPoint[]; position: MapPoint; tileUrl: string; attribution: string }) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<CircleMarker | null>(null);

  useEffect(() => {
    let disposed = false;
    let instance: LeafletMap | null = null;
    void import("leaflet").then((L) => {
      if (disposed || !element.current) return;
      instance = L.map(element.current, { scrollWheelZoom: false });
      map.current = instance;
      L.tileLayer(tileUrl, {
        maxZoom: 19,
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors${attribution ? ` | ${attribution.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c))}` : ""}`,
      }).addTo(instance);
      const points: [number, number][] = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
      const line = L.polyline(points, { color: "#2563eb", weight: 5 }).addTo(instance);
      L.circleMarker(points[points.length - 1], { radius: 8, color: "#dc2626" }).addTo(instance).bindPopup("Destino");
      instance.fitBounds(line.getBounds(), { padding: [24, 24] });
    }).catch(() => {
      if (!disposed && element.current) element.current.textContent = "Não foi possível carregar o mapa.";
    });
    return () => {
      disposed = true;
      marker.current = null;
      map.current = null;
      instance?.remove();
    };
  }, [coordinates, tileUrl, attribution]);

  useEffect(() => {
    let disposed = false;
    void import("leaflet").then((L) => {
      if (disposed || !map.current) return;
      const point: [number, number] = [position[1], position[0]];
      if (marker.current) marker.current.setLatLng(point);
      else marker.current = L.circleMarker(point, { radius: 8, color: "#0369a1", fillOpacity: 1 }).addTo(map.current).bindPopup("Sua localização");
      if (!map.current.getBounds().contains(point)) map.current.panTo(point);
    });
    return () => { disposed = true; };
  }, [position, coordinates]);

  return <div ref={element} role="region" aria-label="Mapa da rota" className="h-72 w-full overflow-hidden rounded-lg bg-slate-100" />;
}
