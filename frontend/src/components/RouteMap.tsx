import { useEffect } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Band, RankedClient, Route } from "../types";
import { BAND_LABEL, fmtC, workerColour } from "../format";

const BAND_FILL: Record<Band, string> = { red: "#c4242a", amber: "#c26a00", green: "#2e7d32", unknown: "#8a8a8a" };

interface Props {
  center: [number, number];
  office: [number, number];
  clients: RankedClient[];
  routes: Route[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function FitTo({ clients, office }: { clients: RankedClient[]; office: [number, number] }) {
  const map = useMap();
  const key = clients.map((c) => c.client_id).sort().join() + office.join();
  useEffect(() => {
    if (!clients.length) return;
    const b = L.latLngBounds([office, ...clients.map((c) => [c.lat, c.lon] as [number, number])]);
    const fit = () => {
      map.invalidateSize();
      map.fitBounds(b, { padding: [28, 28] });
    };
    fit();
    // The grid settles after first paint; refit once it has its real size.
    const h = setTimeout(fit, 250);
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => {
      clearTimeout(h);
      ro.disconnect();
    };
    // Only refit when the set of people or the city changes, not on every hour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

const officeIcon = L.divIcon({ className: "", html: '<div class="office-icon" title="Agency office">HQ</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
const stopIcon = (n: number, colour: string) =>
  L.divIcon({ className: "", html: `<div class="stop-num" style="background:${colour}">${n}</div>`, iconSize: [20, 20], iconAnchor: [-4, 24] });

export default function RouteMap({ center, office, clients, routes, selectedId, onSelect }: Props) {
  // Draw green first so urgent pins sit on top.
  const order: Band[] = ["unknown", "green", "amber", "red"];
  const sorted = [...clients].sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band));
  const selected = clients.find((c) => c.client_id === selectedId);

  return (
    <div className="mapwrap" role="region" aria-label="Map of clients and visit routes">
      <MapContainer center={center} zoom={12} scrollWheelZoom zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <FitTo clients={clients} office={office} />
        {routes?.map((r) => (
          <Polyline key={r.worker} positions={r.path} pathOptions={{ color: workerColour(r.worker), weight: 4, opacity: 0.85 }} />
        ))}
        {sorted.map((c) => (
          <CircleMarker
            key={c.client_id}
            center={[c.lat, c.lon]}
            radius={c.band === "red" ? 8 : c.band === "amber" ? 7 : 5}
            pathOptions={{
              color: "#ffffff",
              weight: 1.5,
              fillColor: c.status === "needs_visit" ? BAND_FILL[c.band] : BAND_FILL.unknown,
              fillOpacity: c.status === "needs_visit" ? 0.95 : 0.6,
            }}
            eventHandlers={{ click: () => onSelect(c.client_id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {c.name}, {c.age} · {BAND_LABEL[c.band]} · {fmtC(c.indoor_c)}
            </Tooltip>
          </CircleMarker>
        ))}
        {selected && (
          <CircleMarker center={[selected.lat, selected.lon]} radius={14} pathOptions={{ color: "#141414", weight: 2.5, fill: false }} interactive={false} />
        )}
        {routes?.flatMap((r) =>
          r.stops.map((s, i) => {
            const c = clients.find((x) => x.client_id === s.client_id);
            return c ? <Marker key={`${r.worker}-${s.client_id}`} position={[c.lat, c.lon]} icon={stopIcon(i + 1, workerColour(r.worker))} interactive={false} /> : null;
          }),
        )}
        <Marker position={office} icon={officeIcon}>
          <Tooltip direction="top">Agency office: routes start here</Tooltip>
        </Marker>
      </MapContainer>
      <div className="legend" aria-hidden="true">
        <span><i className="swatch" style={{ background: BAND_FILL.red, borderRadius: "50%" }} />Urgent</span>
        <span><i className="swatch" style={{ background: BAND_FILL.amber, borderRadius: "50%" }} />Watch</span>
        <span><i className="swatch" style={{ background: BAND_FILL.green, borderRadius: "50%" }} />OK</span>
        <span><i className="swatch" style={{ background: BAND_FILL.unknown, borderRadius: "50%" }} />Handled</span>
      </div>
    </div>
  );
}
