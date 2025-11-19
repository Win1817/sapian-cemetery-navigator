// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Fix Leaflet icon issue in React/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
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

const walkingPathCoords: [number, number][] = [
  [11.495127981363993, 122.60979924526652],
  [11.494928651699666, 122.60981068705934],
  [11.49493986399753, 122.60992383368006],
  [11.494129749317906, 122.61007183039277],
  [11.494021562546706, 122.60986976342849],
  [11.4949293748858, 122.60981066360614],
];

const blockPolygons = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60987040151116, 11.49435013017984], [122.60987612430188, 11.494244418229997], [122.6100225745343, 11.494272277102695], [122.61000902871365, 11.494377659676218], [122.60987040151116, 11.49435013017984] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60981554913673, 11.49502281484294], [122.60982099305397, 11.494948841871974], [122.60996235249871, 11.494959169822494], [122.61010495751594, 11.494138354640597], [122.60984948830571, 11.493984556527707], [122.60985016559471, 11.493914867364467], [122.6101924352169, 11.494116866043242], [122.61001339863526, 11.495048618100952], [122.60981554913673, 11.49502281484294] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.6098790941748, 11.494223018125354], [122.60988526157496, 11.494144174653428], [122.6100376305659, 11.494172284764531], [122.61002413201857, 11.49425577544244], [122.6098790941748, 11.494223018125354] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60984377532583, 11.49478218793351], [122.6098604352303, 11.494656501557898], [122.60993400454879, 11.494671001465306], [122.60991271045344, 11.49479533754888], [122.60984377532583, 11.49478218793351] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60984714407147, 11.49463395899005], [122.60985722538004, 11.494527870320255], [122.60998036485552, 11.494552788438995], [122.60996452692461, 11.494656922941473], [122.60984714407147, 11.49463395899005] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.6098571634202, 11.494495527946839], [122.60986667566169, 11.494371285192358], [122.61000634310938, 11.49439781333021], [122.60998867820211, 11.494521986389458], [122.6098571634202, 11.494495527946839] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60988727431737, 11.494129398520016], [122.60989189833589, 11.49407078269418], [122.60998243694229, 11.494086210974416], [122.6099757279215, 11.494145672133854], [122.60988727431737, 11.494129398520016] ]] }},
    { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[ [122.60982838264556, 11.494913303363461], [122.6098403088343, 11.49480363452912], [122.60991102134591, 11.494814847067829], [122.60989466789442, 11.494923540665837], [122.60982838264556, 11.494913303363461] ]] }}
  ]
};

const CemeteryMap = ({ selectedGrave, setSelectedGrave, userLocation }: CemeteryMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const gravesLayerRef = useRef<L.LayerGroup | null>(null);
  const dynamicLayerRef = useRef<L.LayerGroup | null>(null);
  const staticLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const graveLayersRef = useRef<L.Layer[]>([]);

  const { toast } = useToast();
  const [graves, setGraves] = useState<Grave[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distance: number; duration: number } | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [showRouteCard, setShowRouteCard] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const arrivedRef = useRef(false);

  const COLORS = {
    primary: "#1e4d3a",
    path: "#a39f5a",
    graveBody: "#e2e8f0",
    headstone: "#2d3748",
    accent: "#a39f5a"
  };

  const center: [number, number] = [11.4945215, 122.6100805];
  const entrance: [number, number] = [11.495127981363993, 122.60979924526652];

  const formatDistance = (m: number) => m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
  const formatTime = (s: number) => {
    const m = Math.round(s / 60);
    return m < 60 ? `${m} min` : `${Math.floor(m/60)}h ${m % 60}m`;
  };

  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.9;
    utter.lang = "en-US";
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
  };

  // Map Setup
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = L.map(mapContainerRef.current, {
      center,
      zoom: 18,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap contributors & CARTO',
      maxZoom: 20,
      subdomains: "abcd"
    }).addTo(mapRef.current);

    setTimeout(() => mapRef.current?.invalidateSize(), 100);

    staticLayerRef.current = L.layerGroup().addTo(mapRef.current);
    gravesLayerRef.current = L.layerGroup().addTo(mapRef.current);
    dynamicLayerRef.current = L.layerGroup().addTo(mapRef.current);

    L.polygon([
      [11.495086199371954, 122.60979650734345],
      [11.493881585771362, 122.60982924452287],
      [11.494108374835463, 122.61020540340468],
      [11.495115965795222, 122.61001343784352],
      [11.495086199371954, 122.60979650734345]
    ], { color: COLORS.primary, weight: 3, fillColor: COLORS.primary, fillOpacity: 0.12 })
      .addTo(staticLayerRef.current);

    L.polyline(walkingPathCoords, { color: COLORS.path, weight: 9, opacity: 0.8 }).addTo(staticLayerRef.current);
    L.polyline(walkingPathCoords, { color: "#fff", weight: 4, opacity: 0.9 }).addTo(staticLayerRef.current);

    const entranceIcon = L.divIcon({
      html: `<div style="background:${COLORS.primary};color:white;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:14px;border:4px solid white;box-shadow:0 6px 20px rgba(0,0,0,0.3);">ENT</div>`,
      className: "",
      iconSize: [44],
      iconAnchor: [22, 22]
    });
    L.marker(entrance, { icon: entranceIcon, zIndexOffset: 1000 }).addTo(staticLayerRef.current);

    L.geoJSON(blockPolygons as any, {
      style: { color: "#999", weight: 2, fillColor: "#d9d2c2", fillOpacity: 0.85 },
      onEachFeature: (_, layer) => {
        layer.on({
          mouseover: () => layer.setStyle({ fillOpacity: 0.98 }),
          mouseout: () => layer.setStyle({ fillOpacity: 0.85 })
        });
      }
    }).addTo(staticLayerRef.current);
  }, []);

  // Fetch graves
  useEffect(() => {
    supabase.from("graves").select("*").then(({ data, error }) => {
      if (error) {
        toast({ title: "Error loading graves", description: error.message, variant: "destructive" });
      } else {
        setGraves(data || []);
      }
    });
  }, [toast]);

  const getPopupHTML = (g: Grave) => {
    const age = g.date_of_birth ? new Date(g.date_of_death || Date.now()).getFullYear() - new Date(g.date_of_birth).getFullYear() : null;
    return `
      <div style="font-family:system-ui,sans-serif;max-width:340px;padding:8px;">
        ${g.grave_image_url ? `<img src="${g.grave_image_url}" style="width:100%;height:180px;object-fit:cover;border-radius:16px;margin-bottom:12px;" onerror="this.remove()"/>` : ''}
        <h3 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111;">${g.grave_name}</h3>
        ${age ? `<p style="margin:4px 0;color:#555;font-size:15px;"><strong>Age:</strong> ${age}</p>` : ''}
        ${g.date_of_birth ? `<p style="margin:4px 0;color:#666;font-size:14px;">Born: ${new Date(g.date_of_birth).toLocaleDateString()}</p>` : ''}
        ${g.date_of_death ? `<p style="margin:4px 0;color:#666;font-size:14px;">Passed: ${new Date(g.date_of_death).toLocaleDateString()}</p>` : ''}
        ${g.additional_info ? `<div style="margin-top:12px;padding:12px;background:#f8fafc;border-radius:12px;font-size:14px;line-height:1.5;color:#444;">${g.additional_info.replace(/\n/g, '<br>')}</div>` : ''}
      </div>
    `;
  };

  // Render Graves — With Initials Inside Grave (Real Cemetery Style)
  useEffect(() => {
    if (!mapRef.current || !gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers();
    graveLayersRef.current = [];

    const zoom = mapRef.current.getZoom();
    if (zoom < 18) return;

    graves.forEach(grave => {
      if (!grave.latitude || !grave.longitude) return;
      const lat = grave.latitude;
      const lng = grave.longitude;

      // Adjusted grave box size
      const body = L.rectangle(
        [[lat - 0.000004, lng - 0.000012], [lat + 0.000025, lng + 0.000012]], // Reduced height and width
        {
          color: "#94a3b8",
          weight: 1.2, // Slightly thinner border
          fillColor: COLORS.graveBody,
          fillOpacity: 0.96,
        }
      );

      const headstone = L.rectangle(
        [[lat + 0.000005, lng - 0.000010], [lat + 0.000018, lng + 0.000010]], // Adjusted headstone position and size
        {
          color: COLORS.headstone,
          weight: 1,
          fillColor: COLORS.headstone,
          fillOpacity: 1,
        }
      );

      const nameParts = grave.grave_name.trim().split(" ");
      const firstInitial = nameParts[0]?.[0]?.toUpperCase() || "";
      const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0];
      const lastInitial = lastName?.[0]?.toUpperCase() || "";
      const initials = `${firstInitial}.${lastInitial}`;

      const labelText = grave.lot_number || (firstInitial && lastInitial ? initials : "PLOT");

      // Label moved inside the grave box
      const label = L.marker([lat - 0.00000005, lng], { // Centered vertically within the grave body
        icon: L.divIcon({
          html: `<div style="
            color: #ffffffff;
            font-family: Georgia, serif;
            font-size: 7px; /* Slightly smaller font for label */
            font-weight: 900;
            letter-spacing: 1.2px;
            text-shadow: 0 1px 1px rgba(0, 88, 129, 0.9);
            pointer-events: none;
            text-align: center;
          ">${labelText}</div>`,
          className: "grave-initials-label",
          iconSize: [40, 20],
          iconAnchor: [20, 10],
        }),
        interactive: false,
        zIndexOffset: 900
      });

      const popup = getPopupHTML(grave);

      [body, headstone, label].forEach(item => {
        item.bindPopup(popup, { maxWidth: 360, className: "grave-popup" });
        item.on("click", () => setSelectedGrave(grave));
        item.addTo(layer);
        graveLayersRef.current.push(item);
      });

      body.on({
        mouseover: () => {
          body.setStyle({ fillColor: "#cbd5e1", weight: 2 }); // Highlight with slightly thicker border on hover
        },
        mouseout: () => {
          body.setStyle({ fillColor: COLORS.graveBody, weight: 1.2 });
        }
      });
    });
  }, [graves, setSelectedGrave]);

  // Zoom handling
  useEffect(() => {
    if (!mapRef.current) return;
    const handleZoom = () => {
      const show = mapRef.current!.getZoom() >= 18;
      if (show) {
        graveLayersRef.current.forEach(l => l.addTo(gravesLayerRef.current!));
      } else {
        gravesLayerRef.current?.clearLayers();
      }
    };
    mapRef.current.on("zoomend", handleZoom);
    return () => mapRef.current?.off("zoomend", handleZoom);
  }, []);

  // Routing & Navigation
  useEffect(() => {
    if (!selectedGrave || !userLocation || !mapRef.current || !dynamicLayerRef.current) {
      dynamicLayerRef.current?.clearLayers();
      routeLineRef.current?.remove();
      setRouteInfo(null);
      setRouteSteps([]);
      setShowRouteCard(false);
      arrivedRef.current = false;
      return;
    }

    const layer = dynamicLayerRef.current;
    layer.clearLayers();

    const gravePos = L.latLng(selectedGrave.latitude!, selectedGrave.longitude!);

    L.marker(gravePos, {
      icon: L.divIcon({
        html: `<div style="width:44px;height:44px;background:${COLORS.accent};border:6px solid white;border-radius:50%;box-shadow:0 0 40px ${COLORS.accent}99;animation:pulse 2s infinite;"></div>`,
        className: "pulse-marker",
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      }),
      zIndexOffset: 5000
    }).addTo(layer)
      .bindPopup(getPopupHTML(selectedGrave), { maxWidth: 380 })
      .openPopup();

    mapRef.current.setView(gravePos, 19);

    fetch(`https://router.project-osrm.org/route/v1/walking/${userLocation[1]},${userLocation[0]};${entrance[1]},${entrance[0]}?overview=full&geometries=geojson&steps=true`)
      .then(r => r.json())
      .then(data => {
        if (!data.routes?.[0]) return;
        const route = data.routes[0];
        const coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);

        setRouteInfo({ distance: route.distance, duration: route.duration });
        const steps = route.legs[0].steps.map((s: any) => ({
          instruction: s.maneuver.instruction || "Continue straight",
          distance: s.distance,
          duration: s.duration
        }));
        steps.push({ instruction: `Walk inside cemetery to ${selectedGrave.grave_name}`, distance: 0, duration: 0 });
        setRouteSteps(steps);

        const closestIdx = walkingPathCoords.findIndex(p =>
          Math.abs(p[0] - gravePos.lat) < 0.00003 && Math.abs(p[1] - gravePos.lng) < 0.00003
        );
        const internal = closestIdx >= 0 ? walkingPathCoords.slice(0, closestIdx + 2) : [];

        routeLineRef.current = L.polyline([...coords, ...internal.slice(1), [gravePos.lat, gravePos.lng]], {
          color: COLORS.primary,
          weight: 9,
          opacity: 0.95,
          smoothFactor: 1
        }).addTo(layer);
      })
      .catch(() => {
        toast({ title: "Routing unavailable", description: "Using direct path", variant: "destructive" });
      });
  }, [selectedGrave, userLocation, toast]);

  // Arrival detection
  useEffect(() => {
    if (!selectedGrave || !userLocation || arrivedRef.current) return;
    const dist = L.latLng(userLocation[0], userLocation[1]).distanceTo(
      L.latLng(selectedGrave.latitude!, selectedGrave.longitude!)
    );
    if (dist <= 18) {
      speak(`You have arrived at the grave of ${selectedGrave.grave_name}.`);
      toast({ title: "Arrived", description: `${selectedGrave.grave_name}`, variant: "default" });
      arrivedRef.current = true;
    }
  }, [userLocation, selectedGrave, toast]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-50">
      <div ref={mapContainerRef} className="absolute inset-0" />

      {showRouteCard && routeInfo && selectedGrave && (
        <div className="absolute top-4 right-4 z-[9999] w-80 max-w-[92vw] bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="p-5 border-b">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-xl font-bold text-gray-800">Route to {selectedGrave.grave_name}</h2>
              <button onClick={() => setShowRouteCard(false)} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
            </div>
            <div className="flex justify-between items-end">
              <div>
                <p className="text-3xl font-black" style={{ color: COLORS.primary }}>{formatTime(routeInfo.duration)}</p>
                <p className="text-sm text-gray-600">{formatDistance(routeInfo.distance)}</p>
              </div>
              <button
                onClick={() => isSpeaking ? window.speechSynthesis.cancel() : speak(routeSteps.map(s => s.instruction).join(". "))}
                className="px-5 py-3 rounded-xl text-white font-bold shadow-lg"
                style={{ backgroundColor: isSpeaking ? "#dc2626" : COLORS.primary }}
              >
                {isSpeaking ? "Stop" : "Start"} Voice
              </button>
            </div>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto space-y-3">
            {routeSteps.map((step, i) => (
              <div key={i} className="flex gap-3 text-sm">
                <div className="mt-1 text-lg">{i === routeSteps.length - 1 ? "Finish" : "Straight"}</div>
                <div>
                  <p className="font-medium text-gray-800">{step.instruction}</p>
                  {i < routeSteps.length - 1 && (
                    <p className="text-xs text-gray-500">{formatDistance(step.distance)} • {formatTime(step.duration)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedGrave && userLocation && routeInfo && !showRouteCard && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[9999]">
          <div className="bg-white rounded-2xl shadow-2xl px-6 py-4 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-500">Destination</p>
              <p className="font-bold text-lg text-gray-800">{selectedGrave.grave_name}</p>
            </div>
            <button
              onClick={() => {
                setShowRouteCard(true);
                speak(`Starting route to ${selectedGrave.grave_name}. ${formatTime(routeInfo.duration)} walking time.`);
              }}
              className="px-6 py-3 bg-gradient-to-r from-emerald-700 to-emerald-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
            >
              Get Directions
            </button>
          </div>
        </div>
      )}

      {/* FIXED: Removed the unsupported 'jsx' prop from the style tag */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 ${COLORS.accent}99; }
          70% { transform: scale(1.25); box-shadow: 0 0 0 20px transparent; }
        }
        .pulse-marker > div { animation: pulse 2s infinite; }
        .grave-popup .leaflet-popup-content-wrapper {
          border-radius: 18px !important;
          box-shadow: 0 20px 50px rgba(0,0,0,0.25) !important;
        }
        .grave-popup .leaflet-popup-content { margin: 12px !important; }
      `}</style>
    </div>
  );
};

export default CemeteryMap;