import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { MAP_CONFIG } from "./mapConfig";
import { Layers, Volume2, X } from "lucide-react";

// --- INTERFACES (Keep existing interfaces) ---
export interface Grave {
  id: string;
  grave_name: string;
  latitude?: number | null;
  longitude?: number | null;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  is_available?: boolean;
}

export interface MapPolygon {
  id: string;
  name: string;
  coordinates: [number, number][];
  type: "boundary" | "lot" | "block";
  is_available?: boolean;
  grave_id?: string | null;
}

export interface MapConfig {
  cemeteryBoundary: [number, number][] | null;
  polygons: MapPolygon[];
  graves: Grave[];
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
  mapConfig: MapConfig;
}

// --- CONSTANTS ---
const PATH_PRIMARY_COLOR = "#a39f5a";
const PATH_CENTER_COLOR = "#ffffff";
const ROUTE_COLOR = "#2d5f3f";
const GRAVE_HIGHLIGHT_COLOR = "#f4d03f";
const BOUNDARY_COLOR = "#444444"; 
const LOT_AVAILABLE_COLOR = "#cccccc";
const LOT_OCCUPIED_COLOR = "#aaaaaa";

const entranceLocation: [number, number] = [
  11.49508602798545, 122.60979891264897,
];

const walkingPathCoords: [number, number][] = [
  [11.495127981363993, 122.60979924526652],
  [11.494928651699666, 122.60981068705934],
  [11.49493986399753, 122.60992383368006],
  [11.494129749317906, 122.61007183039277],
  [11.494021562546706, 122.60986976342849],
  [11.4949293748858, 122.60981066360614],
];

// --- UTILITIES ---
const getClosestPointOnPath = (target: L.LatLng): L.LatLng => {
  let closest = L.latLng(walkingPathCoords[0][0], walkingPathCoords[0][1]);
  let minDist = Infinity;
  walkingPathCoords.forEach((c) => {
    const p = L.latLng(c[0], c[1]);
    const d = target.distanceTo(p);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  });
  return closest;
};

// --- COMPONENT ---
const CemeteryMap = ({
  selectedGrave,
  setSelectedGrave,
  userLocation,
  mapConfig,
}: CemeteryMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const boundaryLayerRef = useRef<L.LayerGroup | null>(null);
  const backgroundLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null); // Ref for SpeechSynthesis

  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const cartoLayerRef = useRef<L.TileLayer | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);

  const { toast } = useToast();
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [isRouteCardVisible, setIsRouteCardVisible] = useState(false); 
  const [isLayerSelectorVisible, setIsLayerSelectorVisible] = useState(false);
  const [activeLayer, setActiveLayer] = useState<string>("CartoLight");
  const [isSpeaking, setIsSpeaking] = useState(false);


  // 🟢 VOICE NAVIGATION LOGIC
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  const stopVoiceNavigation = () => {
    if (synthRef.current && synthRef.current.speaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      toast({ title: "Voice Guide", description: "Voice navigation stopped.", duration: 2000 });
    }
  };

  const startVoiceNavigation = () => {
    if (!synthRef.current || routeSteps.length === 0) {
      toast({ title: "Voice Guide", description: "Speech not supported or no route available.", variant: "destructive" });
      return;
    }

    // Stop any existing speech
    stopVoiceNavigation(); 

    setIsSpeaking(true);
    const welcomeText = `Starting navigation to ${selectedGrave?.grave_name}. Total estimated time is ${(routeInfo?.duration || 0 / 60).toFixed(0)} minutes.`;
    
    // Combine steps into a single array of utterances
    const utterances = [
        new SpeechSynthesisUtterance(welcomeText)
    ];

    routeSteps.forEach((step, index) => {
        let stepText = step.instruction;
        if (step.distance > 0) {
             stepText += `. Proceed for about ${step.distance.toFixed(0)} meters.`;
        } else if (index === routeSteps.length - 1) {
             stepText = `You have arrived at ${selectedGrave?.grave_name}. The guide has ended.`;
        }
        utterances.push(new SpeechSynthesisUtterance(stepText));
    });

    // Speak the utterances in sequence
    const speakSequence = (index: number) => {
        if (index >= utterances.length || !isSpeaking) {
            setIsSpeaking(false);
            toast({ title: "Voice Guide", description: "Navigation finished.", duration: 3000 });
            return;
        }

        const utterance = utterances[index];
        utterance.onend = () => {
            speakSequence(index + 1);
        };
        utterance.onerror = (event) => {
            console.error('SpeechSynthesis Utterance Error:', event);
            setIsSpeaking(false);
        };
        
        // Find a natural sounding voice (optional)
        const voices = synthRef.current?.getVoices();
        const enUsVoice = voices.find(v => v.lang.startsWith('en-US') && v.localService) || voices[0];
        if (enUsVoice) {
            utterance.voice = enUsVoice;
        }

        synthRef.current?.speak(utterance);
    };

    speakSequence(0);
  };

  const switchLayer = (layerName: string) => {
    if (!mapRef.current) return;

    const layers = {
      Satellite: satelliteLayerRef.current,
      "CartoLight": cartoLayerRef.current,
      "OSM Street": osmLayerRef.current,
    };

    Object.values(layers).forEach(layer => {
      if (layer && mapRef.current?.hasLayer(layer)) {
        mapRef.current.removeLayer(layer);
      }
    });

    const selectedLayer = layers[layerName as keyof typeof layers];
    if (selectedLayer) {
      mapRef.current.addLayer(selectedLayer);
      setActiveLayer(layerName);
    }
    setIsLayerSelectorVisible(false);
  };

  // --- MAP INIT ---
  useEffect(() => {
    // ... (Map initialization logic remains the same) ...
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: MAP_CONFIG.CENTER,
      zoomControl: false,
      minZoom: 15,
      maxZoom: 21,
    });

    satelliteLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.SATELLITE.url, {
      attribution: MAP_CONFIG.TILES.SATELLITE.attribution,
    });
    cartoLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.CARTO_POSITRON.url, {
      attribution: MAP_CONFIG.TILES.CARTO_POSITRON.attribution,
    });
    osmLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.OSM_STANDARD.url, {
      attribution: MAP_CONFIG.TILES.OSM_STANDARD.attribution,
    });

    cartoLayerRef.current.addTo(map);

    L.control.zoom({ position: "topleft" }).addTo(map); 

    mapRef.current = map;
    boundaryLayerRef.current = L.layerGroup().addTo(map);
    backgroundLayerRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);

    // Walking path visuals
    L.polyline(walkingPathCoords, {
      color: PATH_PRIMARY_COLOR,
      weight: 8,
      opacity: 0.75,
    }).addTo(backgroundLayerRef.current!);
    L.polyline(walkingPathCoords, {
      color: PATH_CENTER_COLOR,
      weight: 4,
      opacity: 0.9,
    }).addTo(backgroundLayerRef.current!);

    // Entrance Marker
    const entranceIcon = L.divIcon({
      html: `<div style="background:#2d5f3f;color:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px;border: 2px solid white;">ENT</div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
      className: "",
    });
    L.marker(entranceLocation, {
      icon: entranceIcon,
      zIndexOffset: 1000,
    }).addTo(backgroundLayerRef.current!);

    setTimeout(() => map.invalidateSize(), 100);

    // Cleanup function to stop voice on component unmount
    return () => {
        stopVoiceNavigation();
    };
  }, []);

  // --- CEMETERY POLYGONS ---
  useEffect(() => {
    if (!mapRef.current || !boundaryLayerRef.current || !mapConfig) return;
    boundaryLayerRef.current.clearLayers();

    if (mapConfig.cemeteryBoundary && mapConfig.cemeteryBoundary.length > 0) {
      const boundaryPolygon = L.polygon(mapConfig.cemeteryBoundary, {
        ...MAP_CONFIG.CEMETERY_STYLE,
        fill: true,
      });
      boundaryPolygon.addTo(boundaryLayerRef.current);

      mapRef.current.fitBounds(boundaryPolygon.getBounds(), {
        padding: [10, 10],
        maxZoom: MAP_CONFIG.DEFAULT_ZOOM,
      });

      // Add a label for the cemetery boundary
      const bounds = boundaryPolygon.getBounds();
      const center = bounds.getCenter();
      L.marker(center, {
        icon: L.divIcon({
          className: 'cemetery-boundary-label',
          html: '<div style="font-weight:bold; color:white; text-shadow: 1px 1px 2px #333;">Cemetery Boundary</div>',
          iconSize: [150, 20], 
          iconAnchor: [75, 10],
        }),
      }).addTo(boundaryLayerRef.current);
    }

    mapConfig.polygons.forEach((p) => {
      const isLot = p.type === "lot";
      const polygon = L.polygon(p.coordinates, {
        color: isLot ? "#888888" : BOUNDARY_COLOR,
        weight: isLot ? 1.5 : 1,
        fill: p.type !== "boundary",
        fillColor: isLot
          ? p.is_available
            ? LOT_AVAILABLE_COLOR
            : LOT_OCCUPIED_COLOR
          : undefined,
        fillOpacity: isLot ? 0.6 : 0.1,
      });
      const grave = mapConfig.graves.find((g) => g.id === p.grave_id);
      let popupContent = `<div style="font-weight:bold;">${p.name}</div>`;
      if (isLot) {
        popupContent += `<p style="color:${
          p.is_available ? "green" : "red"
        };">Status: ${
          p.is_available ? "Available" : "Occupied"
        }</p>${grave ? `<p>Grave: ${grave.grave_name}</p>` : ""}`;
      }
      polygon.bindPopup(popupContent);
      polygon.on("click", () => grave && setSelectedGrave(grave));
      polygon.addTo(boundaryLayerRef.current!);

      // Add labels for Block Name and Lot Number
      if (p.type === "lot" || p.type === "block") { 
        const latSum = p.coordinates.reduce((sum, coord) => sum + coord[0], 0);
        const lngSum = p.coordinates.reduce((sum, coord) => sum + coord[1], 0);
        const centroidLat = latSum / p.coordinates.length;
        const centroidLng = lngSum / p.coordinates.length;

        L.marker([centroidLat, centroidLng], {
          icon: L.divIcon({
            className: 'lot-block-label',
            html: `<div style="font-size: 10px; font-weight: bold; color: #333; text-shadow: 0 0 2px white;">${p.name}</div>`,
            iconSize: [80, 20],
            iconAnchor: [40, 10],
          }),
        }).addTo(boundaryLayerRef.current);
      }
    });
  }, [mapConfig, setSelectedGrave]);

  // --- USER LOCATION ---
  useEffect(() => {
    if (!userLocation || !overlayLayerRef.current) return;
    if (userMarkerRef.current) userMarkerRef.current.setLatLng(userLocation);
    else userMarkerRef.current = L.circleMarker(userLocation, { radius: 16, color: "#2d5f3f", weight: 6, fillColor: "#f4d03f", fillOpacity: 1 }).addTo(overlayLayerRef.current);
  }, [userLocation]);

  // --- ROUTING ---
  useEffect(() => {
    if (!selectedGrave || !userLocation || !mapRef.current || !routeLayerRef.current) {
      // Cleanup for route clear
      routeLayerRef.current?.clearLayers();
      overlayLayerRef.current?.clearLayers();
      routeLineRef.current = null;
      setRouteInfo(null);
      setRouteSteps([]);
      setIsRouteCardVisible(false); 
      stopVoiceNavigation(); // Stop voice guide when route is cleared
      if (userLocation && userMarkerRef.current) userMarkerRef.current.addTo(overlayLayerRef.current!);
      return;
    }

    routeLayerRef.current.clearLayers();
    overlayLayerRef.current.clearLayers();
    routeLineRef.current?.remove();
    stopVoiceNavigation(); // Stop voice guide when a new route starts

    const graveLatLng = L.latLng(selectedGrave.centroid_lat || selectedGrave.latitude!, selectedGrave.centroid_lng || selectedGrave.longitude!);
    const closest = getClosestPointOnPath(graveLatLng);

    // Grave Highlight Marker
    const pulsing = L.divIcon({
      html: `<div style="width:52px;height:52px;border-radius:50%;background:${GRAVE_HIGHLIGHT_COLOR};border:6px solid white;box-shadow:0 0 40px ${GRAVE_HIGHLIGHT_COLOR}c0;animation:pulse 2s infinite;"></div>`,
      className: "pulsing-marker",
      iconSize: [52, 52],
      iconAnchor: [26, 26],
    });
    L.marker(graveLatLng, { icon: pulsing, zIndexOffset: 9999 }).addTo(overlayLayerRef.current!).bindPopup(`<div style="padding:12px;font-weight:bold;color:#2d5f3f;">${selectedGrave.grave_name}</div>`).openPopup();
    mapRef.current.setView(graveLatLng, 19);

    // OSRM Routing (User -> Entrance)
    fetch(`https://router.project-osrm.org/route/v1/walking/${userLocation[1]},${userLocation[0]};${entranceLocation[1]},${entranceLocation[0]}?overview=full&geometries=geojson&steps=true`)
      .then((r) => r.json())
      .then((data) => {
        const route = data.routes?.[0];
        let coords: [number, number][] = [];
        if (route) {
          coords = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]]);
          setRouteInfo({ distance: route.distance, duration: route.duration });
          
          // Process route steps for detailed navigation
          const steps = (route.legs[0]?.steps || []).filter((s: any) => s.maneuver?.instruction).map((s: any) => ({ instruction: s.maneuver.instruction, distance: s.distance, duration: s.duration }));
          steps.push({ instruction: `You have reached the main path. Continue towards the grave location.`, distance: 0, duration: 0 }); // Intermediate step
          steps.push({ instruction: `You have arrived at ${selectedGrave.grave_name}`, distance: 0, duration: 0 });
          setRouteSteps(steps);
        }
        
        // Internal Path Routing (Entrance -> Grave)
        const idx = walkingPathCoords.findIndex((p) => Math.abs(p[0] - closest.lat) < 0.00002 && Math.abs(p[1] - closest.lng) < 0.00002);
        const internal = idx >= 0 ? walkingPathCoords.slice(0, idx + 1) : [entranceLocation];
        internal.push([graveLatLng.lat, graveLatLng.lng]);
        
        coords.push(...internal.slice(1)); 

        routeLineRef.current = L.polyline(coords, { color: ROUTE_COLOR, weight: 9, opacity: 0.98 }).addTo(routeLayerRef.current!);
      })
      .catch(() => {
        // Fallback for offline/OSRM error
        const d = L.latLng(userLocation).distanceTo(graveLatLng);
        setRouteInfo({ distance: d, duration: d / 1.4 });
        setRouteSteps([{ instruction: `Follow the straight line path shown to ${selectedGrave.grave_name}.`, distance: d, duration: d / 1.4 }]);
        
        const fallback = [userLocation, entranceLocation, [graveLatLng.lat, graveLatLng.lng]];
        routeLineRef.current = L.polyline(fallback, { color: ROUTE_COLOR, weight: 9 }).addTo(routeLayerRef.current!);
        
        toast({ title: "Offline or Service Error", description: "Direct path shown. Detailed steps unavailable.", variant: "destructive" });
      });
  }, [selectedGrave, userLocation, mapConfig, toast]);


    // Helper to close modal and stop speech
    const handleCloseRouteCard = () => {
        setIsRouteCardVisible(false);
        stopVoiceNavigation();
    };


  // --- RENDER ---
  return (
    <div className="relative w-full h-screen md:h-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />
      
      {/* --- Layer Selector UI (Top Right) --- */}
      <div className="absolute top-4 right-4 z-[1000]">
        <button
          onClick={() => setIsLayerSelectorVisible(!isLayerSelectorVisible)}
          className="bg-white p-2 rounded-md shadow-lg"
        >
          <Layers className="h-5 w-5" />
        </button>
        {isLayerSelectorVisible && (
          <div className="absolute top-full right-0 mt-2 bg-white rounded-md shadow-lg p-2 flex flex-col gap-2">
            {["CartoLight", "Satellite", "OSM Street"].map(layerName => (
              <button
                key={layerName}
                onClick={() => switchLayer(layerName)}
                className={`px-3 py-1 rounded-md text-sm ${
                  activeLayer === layerName
                    ? "bg-[#2d5f3f] text-white"
                    : "bg-gray-100 hover:bg-gray-200"
                }`}
              >
                {layerName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 🟢 ROUTE CARD MODAL UI (Detailed Steps and Voice Guide) */}
      {isRouteCardVisible && routeInfo && selectedGrave && (
          <div className="fixed inset-0 bg-black/60 z-[2000] flex items-center justify-center">
              <div className="bg-white rounded-xl shadow-2xl p-6 w-11/12 max-w-md max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4 border-b pb-2">
                    <h3 className="text-xl font-bold text-[#2d5f3f]">
                        Route to {selectedGrave.grave_name}
                    </h3>
                    <button
                        onClick={handleCloseRouteCard}
                        className="text-gray-600 hover:text-gray-900 font-bold text-2xl"
                        aria-label="Close route details"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>
                
                {/* Voice Guide Button */}
                <button
                    onClick={isSpeaking ? stopVoiceNavigation : startVoiceNavigation}
                    className={`flex items-center justify-center w-full py-2 mb-4 rounded-xl font-bold transition-colors ${
                        isSpeaking 
                            ? "bg-red-500 hover:bg-red-600 text-white" 
                            : "bg-[#2d5f3f] hover:bg-[#1e3f2a] text-white"
                    }`}
                >
                    <Volume2 className="h-5 w-5 mr-2" />
                    {isSpeaking ? "Stop Voice Guide" : "Start Voice Guide"}
                </button>

                <div className="flex justify-between text-sm text-gray-700 mb-4 p-2 border rounded-md">
                    <p>
                        **Distance:** **{(routeInfo.distance / 1000).toFixed(2)} km**
                    </p>
                    <p>
                        **Time:** **{(routeInfo.duration / 60).toFixed(0)} min**
                    </p>
                </div>

                <h4 className="font-semibold text-lg mb-2 text-[#2d5f3f]">Step-by-Step Directions:</h4>
                <ol className="list-decimal list-inside space-y-3 text-sm">
                    {routeSteps.map((step, index) => (
                        <li key={index} className="border-b pb-2 last:border-b-0">
                            <span className="font-medium">{step.instruction}</span>
                            {step.distance > 0 && 
                                <span className="text-gray-500 italic ml-2">({(step.distance).toFixed(0)} m)</span>
                            }
                        </li>
                    ))}
                </ol>
            </div>
          </div>
      )}

      {/* --- Navigation Ready/View Route Button Card (Bottom Center) --- */}
      {selectedGrave && userLocation && routeLineRef.current && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none w-full px-4">
          <div className="pointer-events-auto max-w-md mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl p-5 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex-1 text-center sm-text-left">
                <p className="text-xs text-gray-500 font-medium">
                  Navigation ready to
                </p>
                <p className="font-bold text-lg truncate">
                  {selectedGrave.grave_name}
                </p>
              </div>
              <button
                onClick={() => setIsRouteCardVisible(true)}
                className="bg-[#2d5f3f] hover:bg-[#1e3f2a] text-white font-bold px-8 py-3 rounded-xl shadow-lg text-lg transition-all"
              >
                View Route
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CemeteryMap;