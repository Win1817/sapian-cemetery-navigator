// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Fix default Leaflet marker icons in React
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

// ──────────────────────────────────────────────────────────────
// NEW ACCURATE WALKING PATH (from entrance to cemetery interior)
const walkingPathCoords: [number, number][] = [
  [11.495127981363993, 122.60979924526652], // Entrance
  [11.494928651699666, 122.60981068705934],
  [11.49493986399753, 122.60992383368006],
  [11.494129749317906, 122.61007183039277],
  [11.494021562546706, 122.60986976342849],
  [11.4949293748858, 122.60981066360614], // End point
];

// Cemetery blocks — beige plot areas
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
const formatDistance = (meters: number) => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
};

const formatDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours} hr ${remainingMinutes} min`;
};

const getManeuverIcon = (type: string, modifier?: string) => {
  switch (type) {
    case 'depart': return 'Start';
    case 'arrive': return 'Finish';
    case 'turn':
    case 'new':
    case 'continue':
      if (modifier?.includes('left')) return 'Left Turn';
      if (modifier?.includes('right')) return 'Right Turn';
      return 'Straight Ahead';
    default: return 'Forward';
  }
};

const getClosestPointOnPath = (latlng: L.LatLng): L.LatLng => {
  let minDist = Infinity;
  let closest: [number, number] = walkingPathCoords[0];
  walkingPathCoords.forEach(coord => {
    const p = L.latLng(coord[0], coord[1]);
    const dist = latlng.distanceTo(p);
    if (dist < minDist) {
      minDist = dist;
      closest = coord;
    }
  });
  return L.latLng(closest[0], closest[1]);
};

const CemeteryMap = ({ selectedGrave, setSelectedGrave, userLocation }: CemeteryMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
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

  // Theme colors
  const PRIMARY_COLOR = "#2d5f3f";
  const ROUTE_LINE_COLOR = "#2d5f3f";
  const ENTRANCE_MARKER_COLOR = "#2d5f3f";
  const GRAVE_HIGHLIGHT_COLOR = "#a39f5a";

  const cemeteryCentroid: [number, number] = [11.4945215, 122.6100805];
  const entranceLocation: [number, number] = [11.49508602798545, 122.60979891264897];

  const cemeteryBoundary: [number, number][] = [
    [11.495086199371954, 122.60979650734345],
    [11.493881585771362, 122.60982924452287],
    [11.494108374835463, 122.61020540340468],
    [11.495115965795222, 122.61001343784352],
    [11.495086199371954, 122.60979650734345]
  ];

  // Voice Guidance
  const speakInstructions = (steps: RouteStep[], totalDuration: number) => {
    if (!('speechSynthesis' in window)) {
      toast({ title: "Voice Error", description: "Your browser doesn't support speech synthesis.", variant: "destructive" });
      return;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(true);

    const stepsText = steps.map((step, index) => {
      const distanceStr = formatDistance(step.distance);
      if (index === steps.length - 1) {
        return `Finally, ${step.instruction}.`;
      }
      return `Next, ${step.instruction}. Walk for approximately ${distanceStr}.`;
    }).join(' ');

    const totalTimeStr = formatDuration(totalDuration);
    const welcomeText = `Starting route. Total trip time is about ${totalTimeStr}.`;
    const utterance = new SpeechSynthesisUtterance(welcomeText + ' ' + stepsText);

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Dynamic arrival detection
  useEffect(() => {
    if (!selectedGrave || !userLocation || hasArrivedRef.current) return;
    if (!selectedGrave.latitude || !selectedGrave.longitude) return;

    const graveLatLng = L.latLng(selectedGrave.latitude, selectedGrave.longitude);
    const userLatLng = L.latLng(userLocation[0], userLocation[1]);
    const distanceToGrave = userLatLng.distanceTo(graveLatLng);
    const arrivalThreshold = 20;

    if (distanceToGrave <= arrivalThreshold) {
      if (hasArrivedRef.current) return;
      window.speechSynthesis.cancel();

      const arrivalText = `You have arrived at the grave of ${selectedGrave.grave_name}.`;
      const utterance = new SpeechSynthesisUtterance(arrivalText);
      window.speechSynthesis.speak(utterance);

      toast({
        title: "Destination Reached!",
        description: `You are at ${selectedGrave.grave_name}'s grave.`,
        variant: "default"
      });

      hasArrivedRef.current = true;
      setIsSpeaking(false);
    } else if (distanceToGrave > 50 && hasArrivedRef.current) {
      hasArrivedRef.current = false;
    }
  }, [userLocation, selectedGrave, toast]);

  // Map initialization
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const tileLayers = {
      OpenStreetMap: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 20,
      }),
      CartoPositron: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap, &copy; CARTO',
        maxZoom: 20,
        subdomains: 'abcd',
      }),
      Satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles Esri", maxZoom: 19 }
      ),
    };

    mapRef.current = L.map(mapContainerRef.current, {
      center: cemeteryCentroid,
      zoom: 18,
      layers: [tileLayers.CartoPositron],
      zoomControl: true,
      tap: true,
      tapTolerance: 30,
    });

    setTimeout(() => mapRef.current?.invalidateSize(), 100);

    staticMarkersRef.current = L.layerGroup().addTo(mapRef.current);
    gravesLayerRef.current = L.layerGroup().addTo(mapRef.current);
    dynamicLayerRef.current = L.layerGroup().addTo(mapRef.current);

    L.control.layers({
      "OpenStreetMap": tileLayers.OpenStreetMap,
      "Carto Positron": tileLayers.CartoPositron,
      "Satellite": tileLayers.Satellite
    }, {}, { position: "topright" }).addTo(mapRef.current);

    // Cemetery boundary
    L.polygon(cemeteryBoundary, {
      color: PRIMARY_COLOR,
      weight: 3,
      fillColor: PRIMARY_COLOR,
      fillOpacity: 0.15,
    }).addTo(mapRef.current);

    // Cemetery blocks (beige plots)
    L.geoJSON(blockPolygons, {
      style: {
        color: "#d4c9a8",
        weight: 2,
        fillColor: "#f5ede2",
        fillOpacity: 0.7,
      },
    }).addTo(staticMarkersRef.current!);

    // Walking path
    L.polyline(walkingPathCoords, { color: GRAVE_HIGHLIGHT_COLOR, weight: 8, opacity: 0.75 })
      .addTo(staticMarkersRef.current!);
    L.polyline(walkingPathCoords, { color: "#ffffff", weight: 4, opacity: 0.9 })
      .addTo(staticMarkersRef.current!);

    // Entrance marker
    const entranceIcon = L.divIcon({
      html: `<div style="background:${ENTRANCE_MARKER_COLOR};color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:13px;box-shadow:0 4px 16px ${ENTRANCE_MARKER_COLOR}80;border:3px solid white;">ENT</div>`,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    L.marker(entranceLocation, { icon: entranceIcon, zIndexOffset: 1000 })
      .addTo(staticMarkersRef.current!);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  // Handle resize
  useEffect(() => {
    const handleResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fetch graves
  useEffect(() => {
    const fetchGraves = async () => {
      const { data, error } = await supabase.from("graves").select("*");
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setGraves(data || []);
      }
    };
    fetchGraves();
  }, [toast]);

  const calculateAge = (dob: string, dod?: string) => {
    const birth = new Date(dob);
    const end = dod ? new Date(dod) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const m = end.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
    return age;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  const getRichPopupContent = (grave: Grave) => {
    const age = grave.date_of_birth ? calculateAge(grave.date_of_birth, grave.date_of_death) : "-";
    return `
      <div style="min-width:260px;max-width:340px;font-family:system-ui,-apple-system,sans-serif;">
        ${grave.grave_image_url
          ? `<img src="${grave.grave_image_url}" onerror="this.style.display='none'"
                style="width:100%;height:170px;object-fit:cover;border-radius:14px;margin-bottom:14px;" alt="${grave.grave_name}" />`
          : ""
        }
        <div style="padding:0 8px;">
          <div style="font-weight:800;font-size:19px;color:#111827;margin-bottom:8px;">
            ${grave.grave_name}
          </div>
          <div style="font-size:14px;color:#374151;margin-bottom:4px;"><strong>Age:</strong> ${age}</div>
          ${grave.date_of_birth ? `<div style="font-size:13px;color:#4b5563;"><strong>Born:</strong> ${formatDate(grave.date_of_birth)}</div>` : ""}
          ${grave.date_of_death ? `<div style="font-size:13px;color:#4b5563;margin-top:4px;"><strong>Passed:</strong> ${formatDate(grave.date_of_death)}</div>` : ""}
          ${grave.additional_info
            ? `<div style="margin-top:12px;padding:10px;background:#f3f4f6;border-radius:8px;font-size:13px;line-height:1.5;">
                 ${grave.additional_info.replace(/\n/g, "<br>")}
               </div>`
            : ""
          }
        </div>
      </div>
    `;
  };

  // Render graves
  useEffect(() => {
    if (!mapRef.current || !gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers();

    graves.forEach((grave) => {
      if (!grave.latitude || !grave.longitude) return;

      const rect = L.rectangle(
        [[grave.latitude - 0.0000125, grave.longitude - 0.000025], [grave.latitude + 0.0000125, grave.longitude + 0.000025]],
        { color: "#d9d9d9", weight: 1, fillColor: "#f5f5f5", fillOpacity: 1 }
      );

      rect.on("mouseover", () => rect.setStyle({ fillColor: "#e0e0e0", weight: 2 }));
      rect.on("mouseout", () => rect.setStyle({ fillColor: "#f5f5f5", weight: 1 }));

      const labelText = grave.lot_number || grave.grave_name.split(" ").map(w => w[0]).join("").toUpperCase();
      const labelIcon = L.divIcon({
        html: `<div style="font-size:10px;font-weight:bold;color:#4b5563;text-align:center;">${labelText}</div>`,
        iconSize: [30, 14],
        iconAnchor: [15, 7],
      });

      const marker = L.marker([grave.latitude, grave.longitude], { icon: labelIcon });
      const popupContent = getRichPopupContent(grave);

      rect.bindPopup(popupContent, { maxWidth: window.innerWidth < 480 ? 300 : 360, className: "custom-grave-popup" });
      marker.bindPopup(popupContent, { maxWidth: window.innerWidth < 480 ? 300 : 360, className: "custom-grave-popup" });

      rect.on("click", () => setSelectedGrave(grave));
      marker.on("click", () => setSelectedGrave(grave));

      rect.addTo(layer);
      marker.addTo(layer);
    });
  }, [graves, setSelectedGrave]);

  const handleGetDirections = () => {
    if (routeInfo && routeSteps.length > 0) {
      setIsRouteCardVisible(true);
      speakInstructions(routeSteps, routeInfo.duration);
      hasArrivedRef.current = false;
    } else {
      toast({ title: "Directions Not Ready", description: "Please wait for the route to load.", variant: "default" });
    }
  };

  // Routing logic
  useEffect(() => {
    if (!mapRef.current || !dynamicLayerRef.current || !selectedGrave || !userLocation) {
      dynamicLayerRef.current?.clearLayers();
      routeLineRef.current?.remove();
      setRouteInfo(null);
      setRouteSteps([]);
      setIsRouteCardVisible(false);
      stopSpeaking();
      hasArrivedRef.current = false;
      return;
    }

    const layer = dynamicLayerRef.current;
    layer.clearLayers();
    routeLineRef.current?.remove();

    const graveLatLng = L.latLng(selectedGrave.latitude!, selectedGrave.longitude!);
    const closestOnPath = getClosestPointOnPath(graveLatLng);

    const pulsingIcon = L.divIcon({
      html: `<div style="width:38px;height:38px;border-radius:50%;background:${GRAVE_HIGHLIGHT_COLOR};border:5px solid white;box-shadow:0 0 30px ${GRAVE_HIGHLIGHT_COLOR}80;animation:pulse 2s infinite;"></div>`,
      className: "pulsing-marker",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    L.marker(graveLatLng, { icon: pulsingIcon, zIndexOffset: 3000 })
      .addTo(layer)
      .bindPopup(getRichPopupContent(selectedGrave), { maxWidth: 380, className: "custom-grave-popup" })
      .openPopup();

    mapRef.current.setView(graveLatLng, 19);

    const start = `${userLocation[1]},${userLocation[0]}`;
    const entrance = `${entranceLocation[1]},${entranceLocation[0]}`;

    fetch(`https://router.project-osrm.org/route/v1/walking/${start};${entrance}?overview=full&geometries=geojson&steps=true`)
      ?.then(r => r.json())
      .then(data => {
        let fullRoute: [number, number][] = [];
        const route = data.routes?.[0];

        if (route?.geometry?.coordinates) {
          fullRoute = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);

          setRouteInfo({ distance: route.distance, duration: route.duration });

          const steps: RouteStep[] = [];
          route.legs[0]?.steps.forEach((step: any) => {
            if (step.maneuver?.instruction?.trim()) {
              steps.push({
                instruction: step.maneuver.instruction,
                distance: step.distance,
                duration: step.duration,
              });
            }
          });

          steps.push({
            instruction: `Continue into the cemetery and proceed to the grave of ${selectedGrave.grave_name}.`,
            distance: 0,
            duration: 0,
          });

          setRouteSteps(steps);
        }

        const closestIndex = walkingPathCoords.findIndex(p =>
          Math.abs(p[0] - closestOnPath.lat) < 0.00002 && Math.abs(p[1] - closestOnPath.lng) < 0.00002
        );

        const internalPath = closestIndex >= 0
          ? walkingPathCoords.slice(0, closestIndex + 1)
          : walkingPathCoords.slice(0, Math.min(15, walkingPathCoords.length));

        internalPath.push([graveLatLng.lat, graveLatLng.lng]);
        fullRoute.push(...internalPath.slice(1));

        routeLineRef.current = L.polyline(fullRoute, {
          color: ROUTE_LINE_COLOR,
          weight: 8,
          opacity: 0.95,
        }).addTo(layer);
      })
      .catch(() => {
        const fallback = [userLocation, entranceLocation, [graveLatLng.lat, graveLatLng.lng]];
        routeLineRef.current = L.polyline(fallback, { color: ROUTE_LINE_COLOR, weight: 8, opacity: 0.95 }).addTo(layer);
        toast({ title: "Routing Error", description: "Using fallback route.", variant: "destructive" });
      });
  }, [selectedGrave, userLocation]);

  return (
    <div className="w-full h-screen md:h-full relative">
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" style={{ minHeight: "100vh" }} />

      {/* Route Details Card */}
      {isRouteCardVisible && selectedGrave && routeInfo && (
        <div className="absolute top-4 right-4 z-[9999] bg-white rounded-xl shadow-2xl p-4 max-w-xs w-[90%] md:w-80 max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b pb-2">
            <h3 className="font-bold text-lg text-gray-800 truncate">Route to {selectedGrave.grave_name}</h3>
            <button onClick={() => { setIsRouteCardVisible(false); stopSpeaking(); }} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <div className="mb-4">
            <p className="text-xl font-extrabold" style={{ color: PRIMARY_COLOR }}>{formatDuration(routeInfo.duration)}</p>
            <p className="text-sm text-gray-500">Distance: {formatDistance(routeInfo.distance)}</p>
          </div>
          <div className="mb-4">
            <button
              onClick={isSpeaking ? stopSpeaking : () => speakInstructions(routeSteps, routeInfo.duration)}
              style={{ backgroundColor: isSpeaking ? '#ef4444' : PRIMARY_COLOR }}
              className="w-full text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center justify-center"
            >
              <span className="mr-2">{isSpeaking ? 'Stop' : 'Speak'}</span>
              {isSpeaking ? 'Stop Voice Guidance' : 'Start Voice Guidance'}
            </button>
          </div>
          <div className="space-y-3">
            <h4 className="font-bold text-sm uppercase tracking-wider text-gray-700">Steps</h4>
            {routeSteps.map((step, i) => (
              <div key={i} className="flex items-start space-x-3">
                <div className="mt-0.5 text-lg">{i === routeSteps.length - 1 ? 'Finish' : 'Forward'}</div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{step.instruction}</p>
                  <p className="text-xs text-gray-500">{formatDistance(step.distance)} • {formatDuration(step.duration)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Route Trigger */}
      {selectedGrave && userLocation && routeInfo && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-white rounded-xl shadow-2xl p-3 flex items-center space-x-4 w-[90%] max-w-sm">
          <div className="flex-1">
            <p className="text-xs text-gray-500">Route to</p>
            <p className="font-semibold truncate">{selectedGrave.grave_name}</p>
          </div>
          <button onClick={handleGetDirections} style={{ backgroundColor: PRIMARY_COLOR }} className="text-white font-bold py-2 px-4 rounded-lg">
            View Route
          </button>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 ${GRAVE_HIGHLIGHT_COLOR}80; }
          70% { transform: scale(1.15); box-shadow: 0 0 0 18px transparent; }
        }
        .pulsing-marker > div { animation: pulse 2s infinite; }
        .custom-grave-popup .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.22) !important;
        }
      `}</style>
    </div>
  );
};

export default CemeteryMap;