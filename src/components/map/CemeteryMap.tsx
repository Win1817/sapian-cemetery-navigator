// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Fix Leaflet default icon issue in React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

export interface Grave {
  id: string;
  grave_name: string;
  latitude: number | null;
  longitude: number | null;
  lot_number?: string;
  grave_image_url?: string;
  date_of_birth?: string;
  date_of_death?: string;
  additional_info?: string;
}

interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
}

interface CemeteryMapProps {
  selectedGrave: Grave | null;
  setSelectedGrave: (grave: Grave | null) => void;
  userLocation: [number, number] | null;
}

// Walking path coordinates
const walkingPathCoords: [number, number][] = [
  [11.495127981363993, 122.60979924526652],
  [11.494928651699666, 122.60981068705934],
  [11.49493986399753, 122.60992383368006],
  [11.494129749317906, 122.61007183039277],
  [11.494021562546706, 122.60986976342849],
  [11.4949293748858, 122.60981066360614],
];

// Valid GeoJSON block polygons
const blockPolygons = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60987040151116, 11.49435013017984],
          [122.60987612430188, 11.494244418229997],
          [122.6100225745343, 11.494272277102695],
          [122.61000902871365, 11.494377659676218],
          [122.60987040151116, 11.49435013017984]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60981554913673, 11.49502281484294],
          [122.60982099305397, 11.494948841871974],
          [122.60996235249871, 11.494959169822494],
          [122.61010495751594, 11.494138354640597],
          [122.60984948830571, 11.493984556527707],
          [122.60985016559471, 11.493914867364467],
          [122.6101924352169, 11.494116866043242],
          [122.61001339863526, 11.495048618100952],
          [122.60981554913673, 11.49502281484294]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.6098790941748, 11.494223018125354],
          [122.60988526157496, 11.494144174653428],
          [122.6100376305659, 11.494172284764531],
          [122.61002413201857, 11.49425577544244],
          [122.6098790941748, 11.494223018125354]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60984377532583, 11.49478218793351],
          [122.6098604352303, 11.494656501557898],
          [122.60993400454879, 11.494671001465306],
          [122.60991271045344, 11.49479533754888],
          [122.60984377532583, 11.49478218793351]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60984714407147, 11.49463395899005],
          [122.60985722538004, 11.494527870320255],
          [122.60998036485552, 11.494552788438995],
          [122.60996452692461, 11.494656922941473],
          [122.60984714407147, 11.49463395899005]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.6098571634202, 11.494495527946839],
          [122.60986667566169, 11.494371285192358],
          [122.61000634310938, 11.49439781333021],
          [122.60998867820211, 11.494521986389458],
          [122.6098571634202, 11.494495527946839]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60988727431737, 11.494129398520016],
          [122.60989189833589, 11.49407078269418],
          [122.60998243694229, 11.494086210974416],
          [122.6099757279215, 11.494145672133854],
          [122.60988727431737, 11.494129398520016]
        ]]
      }
    },
    {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[
          [122.60982838264556, 11.494913303363461],
          [122.6098403088343, 11.49480363452912],
          [122.60991102134591, 11.494814847067829],
          [122.60989466789442, 11.494923540665837],
          [122.60982838264556, 11.494913303363461]
        ]]
      }
    }
  ]
};

// Helper functions
const formatDistance = (m: number) => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
const formatDuration = (s: number) => {
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
const calculateAge = (dob: string, dod?: string) => {
  const b = new Date(dob);
  const e = dod ? new Date(dod) : new Date();
  let age = e.getFullYear() - b.getFullYear();
  const md = e.getMonth() - b.getMonth();
  if (md < 0 || (md === 0 && e.getDate() < b.getDate())) age--;
  return age;
};
const formatDate = (d: string) => new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

const getRichPopupContent = (g: Grave) => {
  const age = g.date_of_birth ? calculateAge(g.date_of_birth, g.date_of_death) : null;
  return `
    <div style="font-family:system-ui,sans-serif;min-width:260px;max-width:340px;">
      ${g.grave_image_url ? `<img src="${g.grave_image_url}" onerror="this.style.display='none'" style="width:100%;height:170px;object-fit:cover;border-radius:14px;margin-bottom:12px;" alt="Grave" />` : ""}
      <div style="padding:0 8px;">
        <div style="font-weight:800;font-size:19px;margin-bottom:8px;">${g.grave_name}</div>
        ${age !== null ? `<div style="font-size:14px;color:#374151;"><strong>Age:</strong> ${age}</div>` : ""}
        ${g.date_of_birth ? `<div style="font-size:13px;color:#4b5563;"><strong>Born:</strong> ${formatDate(g.date_of_birth)}</div>` : ""}
        ${g.date_of_death ? `<div style="font-size:13px;color:#4b5563;margin-top:4px;"><strong>Passed:</strong> ${formatDate(g.date_of_death)}</div>` : ""}
        ${g.additional_info ? `<div style="margin-top:12px;padding:10px;background:#f3f4f6;border-radius:8px;font-size:13px;line-height:1.5;">${g.additional_info.replace(/\n/g, "<br>")}</div>` : ""}
      </div>
    </div>`
}
const getClosestPointOnPath = (latlng: L.LatLng): L.LatLng => {
  let min = Infinity, closest = walkingPathCoords[0];
  walkingPathCoords.forEach(c => {
    const d = latlng.distanceTo(L.latLng(c[0], c[1]));
    if (d < min) { min = d; closest = c; }
  });
  return L.latLng(closest[0], closest[1]);
};

const CemeteryMap = ({ selectedGrave, setSelectedGrave, userLocation }: CemeteryMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const gravesLayerRef = useRef<L.LayerGroup | null>(null);
  const dynamicLayerRef = useRef<L.LayerGroup | null>(null);
  const staticMarkersRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const { toast } = useToast();

  const [graves, setGraves] = useState<Grave[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [isRouteCardVisible, setIsRouteCardVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const hasArrivedRef = useRef(false);

  const PRIMARY_COLOR = "#2d5f3f";
  const GRAVE_HIGHLIGHT_COLOR = "#a39f5a";
  const cemeteryCentroid: [number, number] = [11.4945215, 122.6100805];
  const entranceLocation: [number, number] = [11.49508602798545, 122.60979891264897];

  // Voice guidance
  const speakInstructions = (steps: RouteStep[], total: number) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    const text = steps.map((s, i) => i === steps.length - 1 ? `Finally, ${s.instruction}` : `Next, ${s.instruction}. Walk ${formatDistance(s.distance)}`).join(". ");
    const u = new SpeechSynthesisUtterance(`Starting navigation. About ${formatDuration(total)}. ${text}`);
    u.rate = 0.9;
    u.onend = () => setIsSpeaking(false);
    u.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(u);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Arrival detection
  useEffect(() => {
    if (!selectedGrave || !userLocation || hasArrivedRef.current) return;
    if (!selectedGrave.latitude || !selectedGrave.longitude) return;
    const dist = L.latLng(userLocation).distanceTo(L.latLng(selectedGrave.latitude, selectedGrave.longitude));
    if (dist <= 20) {
      stopSpeaking();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(`You have arrived at the grave of ${selectedGrave.grave_name}.`));
      toast({ title: "Arrived!", description: `You are at ${selectedGrave.grave_name}'s grave.` });
      hasArrivedRef.current = true;
    } else if (dist > 60) hasArrivedRef.current = false;
  }, [userLocation, selectedGrave, toast]);

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: cemeteryCentroid,
      zoom: 18,
      zoomControl: true,
      tap: true,
      tapTolerance: 30,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap & CARTO",
      maxZoom: 20,
    }).addTo(map);

    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 100);

    staticMarkersRef.current = L.layerGroup().addTo(map);
    gravesLayerRef.current = L.layerGroup().addTo(map);
    dynamicLayerRef.current = L.layerGroup().addTo(map);

    // Overlay for floating UI
    const overlay = L.DomUtil.create("div");
    overlay.style.position = "absolute";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2000";
    map.getContainer().appendChild(overlay);
    overlayRef.current = overlay;

    // Static map features
    L.polygon([
      [11.495086199371954, 122.60979650734345],
      [11.493881585771362, 122.60982924452287],
      [11.494108374835463, 122.61020540340468],
      [11.495115965795222, 122.61001343784352],
      [11.495086199371954, 122.60979650734345]
    ], { color: PRIMARY_COLOR, weight: 3, fillColor: PRIMARY_COLOR, fillOpacity: 0.15 }).addTo(map);

    L.geoJSON(blockPolygons, {
      style: { color: "#d4c9a8", weight: 2, fillColor: "#f5ede2", fillOpacity: 0.7 }
    }).addTo(staticMarkersRef.current!);

    L.polyline(walkingPathCoords, { color: GRAVE_HIGHLIGHT_COLOR, weight: 8, opacity: 0.75 }).addTo(staticMarkersRef.current!);
    L.polyline(walkingPathCoords, { color: "#ffffff", weight: 4, opacity: 0.9 }).addTo(staticMarkersRef.current!);

    const entranceIcon = L.divIcon({
      html: `<div style="background:${PRIMARY_COLOR};color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;border:3px solid white;box-shadow:0 4px 16px ${PRIMARY_COLOR}80;">ENT</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    L.marker(entranceLocation, { icon: entranceIcon, zIndexOffset: 1000 }).addTo(staticMarkersRef.current!);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      overlayRef.current?.remove();
    };
  }, []);

  useEffect(() => {
    const handler = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Fetch graves
  useEffect(() => {
    supabase.from("graves").select("*").then(({ data, error }) => {
      if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
      else setGraves(data || []);
    });
  }, [toast]);

  // Render grave markers
  useEffect(() => {
    if (!gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers();

    graves.forEach(g => {
      if (!g.latitude || !g.longitude) return;

      const rect = L.rectangle([
        [g.latitude - 0.0000125, g.longitude - 0.000025],
        [g.latitude + 0.0000125, g.longitude + 0.000025]
      ], { color: "#d9d9d9", weight: 1, fillColor: "#f5f5f5", fillOpacity: 1 });

      rect.on("mouseover", () => rect.setStyle({ fillColor: "#e0e0e0", weight: 2 }));
      rect.on("mouseout", () => rect.setStyle({ fillColor: "#f5f5f5", weight: 1 }));

      const label = g.lot_number || g.grave_name.split(" ").map(w => w[0]).join("").toUpperCase();
      const icon = L.divIcon({
        html: `<div style="font-size:10px;font-weight:bold;color:#4b5563;">${label}</div>`,
        iconSize: [30, 14],
        iconAnchor: [15, 7]
      });

      const marker = L.marker([g.latitude, g.longitude], { icon });
      const popup = getRichPopupContent(g);

      rect.bindPopup(popup, { maxWidth: 360, className: "custom-grave-popup" });
      marker.bindPopup(popup, { maxWidth: 360, className: "custom-grave-popup" });

      rect.on("click", () => setSelectedGrave(g));
      marker.on("click", () => setSelectedGrave(g));

      rect.addTo(layer);
      marker.addTo(layer);
    });
  }, [graves, setSelectedGrave]);

  // Routing logic
  useEffect(() => {
    if (!mapRef.current || !dynamicLayerRef.current || !selectedGrave || !userLocation) {
      dynamicLayerRef.current?.clearLayers();
      routeLineRef.current?.remove();
      setRouteInfo(null);
      setRouteSteps([]);
      setIsRouteCardVisible(false);
      return;
    }

    const layer = dynamicLayerRef.current;
    layer.clearLayers();
    routeLineRef.current?.remove();

    const graveLatLng = L.latLng(selectedGrave.latitude!, selectedGrave.longitude!);
    const closest = getClosestPointOnPath(graveLatLng);

    const pulsing = L.divIcon({
      html: `<div style="width:38px;height:38px;border-radius:50%;background:${GRAVE_HIGHLIGHT_COLOR};border:5px solid white;box-shadow:0 0 30px ${GRAVE_HIGHLIGHT_COLOR}80;animation:pulse 2s infinite;"></div>`,
      className: "pulsing-marker",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    L.marker(graveLatLng, { icon: pulsing, zIndexOffset: 3000 })
      .addTo(layer)
      .bindPopup(getRichPopupContent(selectedGrave), { maxWidth: 380 })
      .openPopup();

    mapRef.current.setView(graveLatLng, 19);

    const start = `${userLocation[1]},${userLocation[0]}`;
    const entrance = `${entranceLocation[1]},${entranceLocation[0]}`;

    fetch(`https://router.project-osrm.org/route/v1/walking/${start};${entrance}?overview=full&geometries=geojson&steps=true`)
      .then(r => r.json())
      .then(data => {
        let coords: [number, number][] = [];
        const route = data.routes?.[0];

        if (route?.geometry?.coordinates) {
          coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
          setRouteInfo({ distance: route.distance, duration: route.duration });
          const steps = (route.legs[0]?.steps || [])
            .filter((s: any) => s.maneuver?.instruction)
            .map((s: any) => ({ instruction: s.maneuver.instruction, distance: s.distance, duration: s.duration }));
          steps.push({ instruction: `Arrive at ${selectedGrave.grave_name}'s grave`, distance: 0, duration: 0 });
          setRouteSteps(steps);
        } else {
          const d = L.latLng(userLocation).distanceTo(graveLatLng);
          coords = [userLocation, entranceLocation, [graveLatLng.lat, graveLatLng.lng]];
          setRouteInfo({ distance: d, duration: d / 1.4 });
          setRouteSteps([{ instruction: `Walk directly to ${selectedGrave.grave_name}'s grave`, distance: d, duration: d / 1.4 }]);
        }

        const internal = walkingPathCoords.slice(0,
          walkingPathCoords.findIndex(p => Math.abs(p[0] - closest.lat) < 0.00002 && Math.abs(p[1] - closest.lng) < 0.00002) + 1 || 10
        );
        internal.push([graveLatLng.lat, graveLatLng.lng]);
        coords.push(...internal.slice(1));

        routeLineRef.current = L.polyline(coords, { color: PRIMARY_COLOR, weight: 8, opacity: 0.95 }).addTo(layer);
      })
      .catch(() => {
        const d = L.latLng(userLocation).distanceTo(graveLatLng);
        const fallback = [userLocation, entranceLocation, [graveLatLng.lat, graveLatLng.lng]];
        routeLineRef.current = L.polyline(fallback, { color: PRIMARY_COLOR, weight: 8, opacity: 0.95 }).addTo(layer);
        setRouteInfo({ distance: d, duration: d / 1.4 });
        setRouteSteps([{ instruction: `Walk directly to ${selectedGrave.grave_name}'s grave`, distance: d, duration: d / 1.4 }]);
        toast({ title: "Offline", description: "Showing direct path" });
      });
  }, [selectedGrave, userLocation]);

  const openRouteCard = () => {
    setIsRouteCardVisible(true);
    if (routeSteps.length > 0 && routeInfo) {
      speakInstructions(routeSteps, routeInfo.duration);
    }
  };

  return (
    <div className="relative w-full h-screen md:h-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Floating "View Route" Button */}
      {selectedGrave && userLocation && routeLineRef.current && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2000] pointer-events-none w-full px-4">
          <div className="pointer-events-auto max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm:text-left">
                <p className="text-xs text-gray-500 font-medium">Navigation ready</p>
                <p className="font-bold text-lg truncate">{selectedGrave.grave_name}</p>
              </div>
              <button
                onClick={openRouteCard}
                className="bg-[#2d5f3f] text-white font-bold px-8 py-3 rounded-xl shadow-lg whitespace-nowrap text-lg"
              >
                View Route
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive Route Details Bottom Sheet */}
      {isRouteCardVisible && routeInfo && selectedGrave && (
        <div className="fixed inset-0 z-[2100] flex flex-col pointer-events-none">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 pointer-events-auto"
            onClick={() => { setIsRouteCardVisible(false); stopSpeaking(); }}
          />

          {/* Bottom Sheet Panel */}
          <div className="pointer-events-auto mt-auto max-h-[90vh] w-full animate-slide-up">
            <div className="bg-white rounded-t-3xl shadow-2xl mx-4 mb-4 md:mx-auto md:max-w-2xl md:rounded-2xl md:mt-10 md:mb-20 overflow-hidden">
              {/* Mobile drag handle */}
              <div className="md:hidden flex justify-center pt-3">
                <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
              </div>

              <div className="p-5 md:p-6 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-bold text-lg md:text-xl pr-8">
                    Route to {selectedGrave.grave_name}
                  </h3>
                  <button
                    onClick={() => { setIsRouteCardVisible(false); stopSpeaking(); }}
                    className="text-3xl text-gray-500 hover:text-gray-700 -mr-2"
                  >
                    ×
                  </button>
                </div>

                <div className="text-center mb-6">
                  <p className="text-4xl font-bold" style={{ color: PRIMARY_COLOR }}>
                    {formatDuration(routeInfo.duration)}
                  </p>
                  <p className="text-gray-600 text-lg">{formatDistance(routeInfo.distance)}</p>
                </div>

                <button
                  onClick={isSpeaking ? stopSpeaking : () => routeInfo && speakInstructions(routeSteps, routeInfo.duration)}
                  style={{ backgroundColor: isSpeaking ? "#ef4444" : PRIMARY_COLOR }}
                  className="w-full py-4 rounded-xl text-white font-bold text-lg mb-6 shadow-lg"
                >
                  {isSpeaking ? "Stop" : "Play"} Voice Guidance
                </button>

                <div className="space-y-4 text-sm">
                  {routeSteps.map((s, i) => (
                    <div key={i} className="flex gap-4 pb-4 border-b last:border-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-lg">
                        {i === routeSteps.length - 1 ? "Finish" : "Forward"}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{s.instruction}</div>
                        {s.distance > 0 && (
                          <div className="text-gray-500 text-xs mt-1">
                            {formatDistance(s.distance)} • {formatDuration(s.duration)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 ${GRAVE_HIGHLIGHT_COLOR}80; }
          70% { transform: scale(1.15); box-shadow: 0 0 0 18px transparent; }
        }
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .pulsing-marker > div { animation: pulse 2s infinite; }
        .animate-slide-up { animation: slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .custom-grave-popup .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.22) !important;
        }
      `}</style>
    </div>
  );
};

export default CemeteryMap;