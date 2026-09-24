import type { LayerGroup, Map as LeafletMap } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";

import { HAMA_CENTER, HAMA_INITIAL_REGION, HAMA_SERVICE_RADIUS_METERS, isInsideHama, type MapPoint } from "@/shared/jarbou3";

export type HamaMapProps = {
  compact?: boolean;
  driver?: boolean;
  source?: MapPoint | null;
  destination?: MapPoint | null;
  driverLocation?: MapPoint | null;
  routePath?: MapPoint[];
  selecting?: "source" | "destination";
  onSelect?: (point: MapPoint) => void;
  onOutsideRange?: () => void;
  readOnly?: boolean;
  focusPoint?: MapPoint | null;
  fullScreen?: boolean;
};

type LeafletModule = typeof import("leaflet");
const mapStyle: React.CSSProperties = { height: "100%", width: "100%" };

function jarbou3Icon(L: LeafletModule, label: string, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:17px;border:3px solid #fff;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-family:Arial;box-shadow:0 2px 8px rgba(0,0,0,.28)">${label}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export function HamaMap({ compact = false, source, destination, driverLocation, routePath, selecting, onSelect, onOutsideRange, readOnly = false, focusPoint, fullScreen = false }: HamaMapProps) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const latestProps = useMemo(() => ({ source, destination, driverLocation, routePath, selecting, onSelect, onOutsideRange, readOnly }), [source, destination, driverLocation, routePath, selecting, onSelect, onOutsideRange, readOnly]);

  useEffect(() => {
    let disposed = false;
    if (typeof document === "undefined") return;
    if (!document.getElementById("leaflet-osm-css")) {
      const css = document.createElement("link");
      css.id = "leaflet-osm-css";
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(css);
    }
    void (async () => {
      const L = await import("leaflet");
      if (disposed || !elementRef.current || mapRef.current) return;
      const map = L.map(elementRef.current, { zoomControl: false, attributionControl: true, maxBoundsViscosity: 1, maxBounds: L.latLngBounds([35.05, 36.66], [35.21, 36.85]) });
      map.setView([HAMA_INITIAL_REGION.latitude, HAMA_INITIAL_REGION.longitude], 13);
      L.control.zoom({ position: "bottomleft" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "© OpenStreetMap contributors" }).addTo(map);
      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusPoint) return;
    mapRef.current.flyTo([focusPoint.latitude, focusPoint.longitude], 14, { duration: 0.45 });
  }, [mapReady, focusPoint?.latitude, focusPoint?.longitude]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !elementRef.current) return;
    const timer = window.setTimeout(() => mapRef.current?.invalidateSize(), 50);
    return () => window.clearTimeout(timer);
  }, [mapReady, fullScreen]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !layersRef.current) return;
    let removeClick: (() => void) | undefined;
    void (async () => {
      const L = await import("leaflet");
      const map = mapRef.current;
      const layers = layersRef.current;
      if (!map || !layers) return;
      layers.clearLayers();
      L.circle([HAMA_CENTER.latitude, HAMA_CENTER.longitude], { radius: HAMA_SERVICE_RADIUS_METERS, color: "#757575", weight: 1.5, fillColor: "#757575", fillOpacity: 0.08, dashArray: "5 6" }).addTo(layers);
      if (latestProps.routePath && latestProps.routePath.length > 1) L.polyline(latestProps.routePath.map((point) => [point.latitude, point.longitude]), { color: "#4A4A4A", weight: 4, opacity: 0.85 }).addTo(layers);
      if (latestProps.source) L.marker([latestProps.source.latitude, latestProps.source.longitude], { icon: jarbou3Icon(L, "ا", "#4A4A4A") }).bindTooltip("موقع الاستلام", { direction: "top" }).addTo(layers);
      if (latestProps.destination) L.marker([latestProps.destination.latitude, latestProps.destination.longitude], { icon: jarbou3Icon(L, "و", "#F97316") }).bindTooltip("وجهة العميل", { direction: "top" }).addTo(layers);
      if (latestProps.driverLocation) L.marker([latestProps.driverLocation.latitude, latestProps.driverLocation.longitude], { icon: jarbou3Icon(L, "ج", "#757575") }).bindTooltip("سائق جربوع", { direction: "top" }).addTo(layers);
      const click = (event: import("leaflet").LeafletMouseEvent) => {
        if (latestProps.readOnly || !latestProps.selecting || !latestProps.onSelect) return;
        const point = { latitude: event.latlng.lat, longitude: event.latlng.lng };
        if (isInsideHama(point.latitude, point.longitude)) latestProps.onSelect(point);
        else latestProps.onOutsideRange?.();
      };
      map.on("click", click);
      removeClick = () => map.off("click", click);
    })();
    return () => removeClick?.();
  }, [mapReady, latestProps]);

  return <div style={{ height: fullScreen ? "100%" : compact ? 220 : 310, width: "100%", flex: fullScreen ? 1 : undefined, margin: fullScreen ? 0 : "16px", borderRadius: fullScreen ? 0 : "22px", overflow: "hidden", position: "relative", border: fullScreen ? "none" : "1px solid #D7D7D7" }}><div ref={elementRef} style={mapStyle} /><div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,.94)", borderRadius: 10, padding: "7px 10px", color: "#4A4A4A", fontSize: 11, fontWeight: 800, direction: "rtl" }}>{selecting === "source" ? "اضغط موقع الاستلام" : selecting === "destination" ? "اضغط وجهة التسليم" : "نطاق حماة · ٧ كم"}</div></div>;
}
