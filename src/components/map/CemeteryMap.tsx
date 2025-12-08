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
// Enhanced colors for graves
const LOT_AVAILABLE_FILL = "#90EE90"; // Light green for unassigned
const LOT_AVAILABLE_STROKE = "#22C55E"; // Bright green for unassigned
const LOT_OCCUPIED_FILL = "#FCA5A5"; // Light red for assigned
const LOT_OCCUPIED_STROKE = "#DC2626"; // Bright red for assigned

const walkingPathCoords: [number, number][] = [
  [11.495096158301706, 122.60987221867981],
  [11.494974808049491, 122.60987810662022],
  [11.49499108737686, 122.60998547346168],
  [11.494157882612143, 122.61018592667318],
  [11.494028746061815, 122.60991432451885],
  [11.494974656904034, 122.60987829227338],
];

const entranceLocation: [number, number] = walkingPathCoords[0];

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

// Find the closest point ON a line segment (not just at endpoints)
const getClosestPointOnSegment = (target: L.LatLng, p1: L.LatLng, p2: L.LatLng): { point: L.LatLng; distance: number } => {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const lengthSq = dx * dx + dy * dy;
  
  if (lengthSq === 0) {
    return { point: p1, distance: target.distanceTo(p1) };
  }
  
  // Calculate projection of target onto the line segment
  let t = ((target.lng - p1.lng) * dx + (target.lat - p1.lat) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment
  
  const closestPoint = L.latLng(
    p1.lat + t * dy,
    p1.lng + t * dx
  );
  
  return {
    point: closestPoint,
    distance: target.distanceTo(closestPoint)
  };
};

// Find the closest point anywhere on the walking path linestring
const getClosestPointOnPath_LineString = (target: L.LatLng): { point: L.LatLng; segmentIndex: number } => {
  let closestPoint = walkingPathCoords[0];
  let closestDist = Infinity;
  let closestSegmentIndex = 0;
  
  // Check all line segments
  for (let i = 0; i < walkingPathCoords.length - 1; i++) {
    const p1 = L.latLng(walkingPathCoords[i][0], walkingPathCoords[i][1]);
    const p2 = L.latLng(walkingPathCoords[i + 1][0], walkingPathCoords[i + 1][1]);
    
    const { point, distance } = getClosestPointOnSegment(target, p1, p2);
    
    if (distance < closestDist) {
      closestDist = distance;
      closestPoint = [point.lat, point.lng];
      closestSegmentIndex = i;
    }
  }
  
  return {
    point: L.latLng(closestPoint[0], closestPoint[1]),
    segmentIndex: closestSegmentIndex
  };
};

// TWO-STAGE ROUTING ALGORITHM
// Stage 1: Find nearest point on path for direct access
// Stage 2: Follow the walking path to reach that point
const calculateOptimizedRoute = (graveLatLng: L.LatLng, userLoc: [number, number], entranceLoc: [number, number]) => {
  // STAGE 1: Find the single nearest point on the entire path
  const { point: nearestPathPoint, segmentIndex } = getClosestPointOnPath_LineString(graveLatLng);
  const nearestPoint: [number, number] = [nearestPathPoint.lat, nearestPathPoint.lng];
  
  const entranceLatLng = L.latLng(entranceLoc[0], entranceLoc[1]);
  const nearestPathLatLng = L.latLng(nearestPoint[0], nearestPoint[1]);
  
  // STAGE 2: Intelligent path routing based on grave proximity
  const entranceIndex = 0; // Entrance is always at walkingPathCoords[0]
  
  let pathToFollow: [number, number][] = [];
  let routeDescription = '';
  
  // Determine routing based on grave proximity to path indices
  if (segmentIndex === 5) {
    // Grave is AT index 5
    // Route: 0 → 1 → snap (stops at nearest point, doesn't go all the way to index 5)
    routeDescription = `UPPER SECTION - INDEX 5`;
    console.log(`🚶 ${routeDescription}: Route 0→1→snap (grave at segment ${segmentIndex})`);
    
    pathToFollow.push(walkingPathCoords[0]); // Index 0: Entrance
    pathToFollow.push(walkingPathCoords[1]); // Index 1: Split point
    pathToFollow.push(nearestPoint);         // Snap to exact grave location (don't go to index 5)
    
  } else if (segmentIndex === 4) {
    // Grave is AT index 4
    // Route: 0 → 1 → snap (stops at nearest point on segment 4)
    routeDescription = `UPPER SECTION - INDEX 4`;
    console.log(`🚶 ${routeDescription}: Route 0→1→snap (grave at segment ${segmentIndex})`);
    
    pathToFollow.push(walkingPathCoords[0]); // Index 0: Entrance
    pathToFollow.push(walkingPathCoords[1]); // Index 1: Split point
    pathToFollow.push(nearestPoint);         // Snap to exact grave location
    
  } else if (segmentIndex >= 2) {
    // MIDDLE SECTION: Graves near indices 2–3–4
    // Route: 0 → 1 → 2 → 3 → 4 → snap to nearest point
    routeDescription = `MIDDLE SECTION (near indices 2–3–4)`;
    console.log(`🚶 ${routeDescription}: Route 0→1→2→3→4→snap (grave at segment ${segmentIndex})`);
    
    pathToFollow.push(walkingPathCoords[0]); // Index 0: Entrance
    pathToFollow.push(walkingPathCoords[1]); // Index 1: Split point
    pathToFollow.push(walkingPathCoords[2]); // Index 2: Path continues
    
    // Only include indices up to where we need to reach the grave
    if (segmentIndex >= 3) {
      pathToFollow.push(walkingPathCoords[3]); // Index 3: Path continues
    }
    if (segmentIndex >= 4) {
      pathToFollow.push(walkingPathCoords[4]); // Index 4: Path continues
    }
    
    pathToFollow.push(nearestPoint); // Snap to exact grave location
    
  } else if (segmentIndex <= 1) {
    // LOWER SECTION: Graves near indices 0–1
    // Route: 0 → 1 → snap to nearest point
    routeDescription = `LOWER SECTION (near entrance indices 0–1)`;
    console.log(`🚶 ${routeDescription}: Route 0→1→snap (grave at segment ${segmentIndex})`);
    
    pathToFollow.push(walkingPathCoords[0]); // Index 0: Entrance
    pathToFollow.push(walkingPathCoords[1]); // Index 1: First waypoint
    pathToFollow.push(nearestPoint);         // Snap to exact grave location
  }
  
  // Calculate total distance along the path
  let pathDistance = 0;
  for (let i = 1; i < pathToFollow.length; i++) {
    const from = L.latLng(pathToFollow[i - 1][0], pathToFollow[i - 1][1]);
    const to = L.latLng(pathToFollow[i][0], pathToFollow[i][1]);
    pathDistance += from.distanceTo(to);
  }
  
  console.log(`📍 Nearest point: [${nearestPoint[0].toFixed(5)}, ${nearestPoint[1].toFixed(5)}] at segment ${segmentIndex}`);
  console.log(`📍 Path with ${pathToFollow.length} waypoints, distance: ${pathDistance.toFixed(1)}m`);
  console.log(`📍 Section: ${routeDescription}`);
  
  return {
    nearestPathPoint: nearestPathLatLng,
    internalPath: pathToFollow,
    directDistance: pathDistance,
    segmentIndex: segmentIndex,
    section: routeDescription
  };
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
  const navigationWatchIdRef = useRef<number | null>(null); // Track location watch ID
  const navigationActiveRef = useRef<boolean>(false); // Track if navigation is active
  const userInitiatedVoiceRef = useRef<boolean>(false); // Track if user manually started voice nav
  const lastLocationUpdateRef = useRef<number>(0); // Throttle location updates
  const lastDistanceRef = useRef<number>(0); // Track last distance to avoid unnecessary updates

  const satelliteLayerRef = useRef<L.TileLayer | null>(null);
  const cartoLayerRef = useRef<L.TileLayer | null>(null);
  const osmLayerRef = useRef<L.TileLayer | null>(null);

  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [isRouteCardVisible, setIsRouteCardVisible] = useState(false);
  const [isRouteCardCollapsed, setIsRouteCardCollapsed] = useState(false);
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
    }
    navigationActiveRef.current = false;
    userInitiatedVoiceRef.current = false;
  };

  const startVoiceNavigation = () => {
    if (!synthRef.current || routeSteps.length === 0 || !selectedGrave) {
      return;
    }

    // Stop any existing speech
    stopVoiceNavigation(); 

    setIsSpeaking(true);
    navigationActiveRef.current = true;
    const welcomeText = `Starting navigation to ${selectedGrave.grave_name}. Total estimated time is ${Math.round(routeInfo?.duration || 0)} minutes.`;
    
    // Combine steps into a single array of utterances
    const utterances = [
        new SpeechSynthesisUtterance(welcomeText)
    ];

    routeSteps.forEach((step, index) => {
        let stepText = step.instruction;
        if (step.distance > 0) {
             stepText += `. Proceed for about ${step.distance.toFixed(0)} meters.`;
        } else if (index === routeSteps.length - 1) {
             stepText = `You have arrived at ${selectedGrave.grave_name}. The guide has ended.`;
        }
        utterances.push(new SpeechSynthesisUtterance(stepText));
    });

    // Speak the utterances in sequence
    const speakSequence = (index: number) => {
        if (index >= utterances.length) {
            setIsSpeaking(false);
            navigationActiveRef.current = false;
            return;
        }

        const utterance = utterances[index];
        utterance.onend = () => {
            speakSequence(index + 1);
        };
        utterance.onerror = () => {
            setIsSpeaking(false);
            navigationActiveRef.current = false;
        };
        
        // Find a natural sounding voice (optional)
        const voices = synthRef.current?.getVoices();
        const enUsVoice = voices?.find(v => v.lang.startsWith('en-US') && v.localService) || voices?.[0];
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
      minZoom: 12,
      maxZoom: 22,
    });

    satelliteLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.SATELLITE.url, {
      maxZoom: MAP_CONFIG.TILES.SATELLITE.maxZoom,
      attribution: MAP_CONFIG.TILES.SATELLITE.attribution,
    });
    cartoLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.CARTO_POSITRON.url, {
      maxZoom: MAP_CONFIG.TILES.CARTO_POSITRON.maxZoom,
      attribution: MAP_CONFIG.TILES.CARTO_POSITRON.attribution,
    });
    osmLayerRef.current = L.tileLayer(MAP_CONFIG.TILES.OSM_STANDARD.url, {
      maxZoom: MAP_CONFIG.TILES.OSM_STANDARD.maxZoom,
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
        color: isLot 
          ? (p.is_available ? LOT_AVAILABLE_STROKE : LOT_OCCUPIED_STROKE)
          : BOUNDARY_COLOR,
        weight: isLot ? 2.5 : 1.5,
        fill: p.type !== "boundary",
        fillColor: isLot
          ? p.is_available
            ? LOT_AVAILABLE_FILL
            : LOT_OCCUPIED_FILL
          : undefined,
        fillOpacity: isLot ? 0.7 : 0.1,
      });
      
      const grave = mapConfig.graves.find((g) => g.id === p.grave_id);
      
      let popupContent = `<div style="font-weight:bold;">${p.name}</div>`;
      if (isLot) {
        const statusColor = p.is_available ? "#22C55E" : "#DC2626";
        const statusText = p.is_available ? "Available" : "Assigned";
        popupContent += `<p style="color:${statusColor}; font-weight:600;">Status: ${statusText}</p>${grave ? `<p style="margin-top:6px;"><strong>Resident:</strong> ${grave.grave_name}</p>` : ""}`;
      }
      polygon.bindPopup(popupContent);
      polygon.on("click", () => grave && setSelectedGrave(grave));
      polygon.addTo(boundaryLayerRef.current!);

      // Note: Pin icons will only show when a specific grave is selected/searched
      // They are rendered dynamically in the ROUTING effect, not here

      // Add labels for Block Name and Lot Number
      if (p.type === "lot" || p.type === "block") { 
        const latSum = p.coordinates.reduce((sum, coord) => sum + coord[0], 0);
        const lngSum = p.coordinates.reduce((sum, coord) => sum + coord[1], 0);
        const centroidLat = latSum / p.coordinates.length;
        const centroidLng = lngSum / p.coordinates.length;

        // Extract block and lot from name (e.g., "Block A - Lot 1" -> "BA-L1" or "Block 7 - Lot 15" -> "B7-L15")
        const parts = p.name.split(' - ');
        let labelText = '';
        
        parts.forEach((part: string, idx: number) => {
          const tokens = part.trim().split(' ');
          // Extract first letter of first word + full number if exists
          let label = tokens[0].charAt(0); // First letter of word (B, L, etc)
          if (tokens[1]) {
            label += tokens[1]; // Add the number part (7, 15, etc)
          }
          labelText += label;
          if (idx < parts.length - 1) labelText += '-'; // Add separator between block and lot
        });

        L.marker([centroidLat, centroidLng], {
          icon: L.divIcon({
            className: 'lot-block-label',
            html: `<div style="font-size: 10px; font-weight: bold; color: #333; text-shadow: 0 0 2px white;">${labelText}</div>`,
            iconSize: [60, 20],
            iconAnchor: [30, 10],
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

    // Find the polygon associated with this grave
    const polygon = mapConfig.polygons.find((p) => p.grave_id === selectedGrave.id);
    if (!polygon) {
      return;
    }

    // Calculate centroid from polygon coordinates
    const latSum = polygon.coordinates.reduce((sum, coord) => sum + coord[0], 0);
    const lngSum = polygon.coordinates.reduce((sum, coord) => sum + coord[1], 0);
    const centroidLat = latSum / polygon.coordinates.length;
    const centroidLng = lngSum / polygon.coordinates.length;

    const graveLatLng = L.latLng(centroidLat, centroidLng);
    
    // TWO-STAGE ROUTING: Find nearest path point and route to it
    const routeOptimization = calculateOptimizedRoute(graveLatLng, userLocation, entranceLocation);
    const nearestPathPoint = routeOptimization.nearestPathPoint;
    const internalPath = routeOptimization.internalPath;
    const snapPoint: [number, number] = [nearestPathPoint.lat, nearestPathPoint.lng];
    
    console.log(`🔧 OPTIMIZED ROUTE: Grave at [${centroidLat.toFixed(5)}, ${centroidLng.toFixed(5)}] → nearest path point [${snapPoint[0].toFixed(5)}, ${snapPoint[1].toFixed(5)}]`);

    // Grave Highlight Marker
    const pulsing = L.divIcon({
      html: `<div style="width:36px;height:36px;border-radius:50%;background:#2563eb;border:4px solid white;box-shadow:0 0 30px #2563ebc0;animation:pulse 2s infinite;"></div>`,
      className: "pulsing-marker",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    // Extract initials from polygon name (e.g., "Block A - Lot 1" -> "BA-L1" or "Block 7 - Lot 15" -> "B7-L15")
    const namePartParts = polygon.name.split(' - ');
    let nameLabel = '';
    
    namePartParts.forEach((part: string, idx: number) => {
      const tokens = part.trim().split(' ');
      // Extract first letter of first word + full number if exists
      let label = tokens[0].charAt(0); // First letter of word (B, L, etc)
      if (tokens[1]) {
        label += tokens[1]; // Add the number part (7, 15, etc)
      }
      nameLabel += label;
      if (idx < namePartParts.length - 1) nameLabel += '-'; // Add separator between block and lot
    });
    
    L.marker(graveLatLng, { icon: pulsing, zIndexOffset: 9999 }).addTo(overlayLayerRef.current!).bindPopup(`<div style="min-width:160px;"><div style="padding:8px;border-bottom:2px solid #2d5f3f;margin-bottom:6px;"><div style="font-weight:bold;font-size:12px;color:#2d5f3f;">${selectedGrave.grave_name}</div></div><div style="padding:6px;"><div style="font-size:11px;color:#666;"><span style="color:#999;font-weight:500;">Location:</span> ${polygon.name}</div></div></div>`).openPopup();
    mapRef.current.setView(graveLatLng, 19);

    // Show pin icon for selected grave
    const pinIcon = L.divIcon({
      html: `<div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; position: relative;">
        <svg width="24" height="24" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2C11.7 2 5 8.7 5 17C5 29 20 38 20 38S35 29 35 17C35 8.7 28.3 2 20 2Z" fill="#2563eb" stroke="white" stroke-width="2"/>
          <circle cx="20" cy="17" r="6" fill="white"/>
        </svg>
      </div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 24],
      className: "grave-pin-marker",
    });

    L.marker([centroidLat, centroidLng], {
      icon: pinIcon,
      zIndexOffset: 500,
    }).addTo(overlayLayerRef.current!);

    // THREE-STAGE ROUTING:
    // 1. OSM Route: User location → Cemetery entrance (external streets)
    // 2. Internal Path: Cemetery entrance → Walking path to grave
    // 3. Final Approach: Snap point → Grave center
    
    const userLng = userLocation[1];
    const userLat = userLocation[0];
    const entranceLng = entranceLocation[1];
    const entranceLat = entranceLocation[0];
    
    // Use OSRM (OpenStreetMap Routing Machine) for external routing
    const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${userLng},${userLat};${entranceLng},${entranceLat}?overview=full&geometries=geojson`;
    
    fetch(osrmUrl)
      .then((r) => r.json())
      .then((data) => {
        let externalRouteCoords: [number, number][] = [];
        let externalDistance = 0;
        let externalDuration = 0;
        
        // Extract route from OSRM response
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const geometry = route.geometry;
          
          if (geometry.coordinates) {
            // Convert from [lng, lat] to [lat, lng]
            externalRouteCoords = geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          }
          
          externalDistance = route.distance || 0; // meters
          externalDuration = route.duration || 0; // seconds
        }
        
        // Build complete route: External OSM route + Internal cemetery path
        const completeRoute = [...externalRouteCoords, ...internalPath];
        
        // Calculate distances for cemetery portion
        const entranceToSnapDist = routeOptimization.directDistance;
        const snapToGraveDist = L.latLng(snapPoint[0], snapPoint[1]).distanceTo(graveLatLng);
        
        // Total distances
        const totalDistance = externalDistance + entranceToSnapDist + snapToGraveDist;
        const totalDuration = externalDuration + (entranceToSnapDist / 1.4) + (snapToGraveDist / 1.4);
        
        // Set route info
        setRouteInfo({ 
          distance: totalDistance / 1000,
          duration: totalDuration / 60
        });
        
        // Create route steps
        const steps: RouteStep[] = [];
        
        // Step 1: External OSM route instructions
        steps.push({
          instruction: `→ Walk to cemetery entrance (${Math.round(externalDistance)} m)`,
          distance: externalDistance,
          duration: externalDuration
        });
        
        // Step 2: Enter cemetery
        steps.push({ 
          instruction: `📍 Entered cemetery. Follow the main walking path.`, 
          distance: 0, 
          duration: 0 
        });
        
        // Step 3: Navigate to grave location via internal path
        steps.push({ 
          instruction: `🎯 Follow path towards lot ${polygon.name} (${Math.round(entranceToSnapDist)} m)`, 
          distance: entranceToSnapDist,
          duration: entranceToSnapDist / 1.4
        });
        
        // Step 4: Final approach
        steps.push({ 
          instruction: `→ Head to grave location (${Math.round(snapToGraveDist)} m)`, 
          distance: snapToGraveDist,
          duration: snapToGraveDist / 1.4
        });
        
        // Step 5: Arrival
        steps.push({ 
          instruction: `✓ You have arrived at ${selectedGrave.grave_name}`, 
          distance: 0, 
          duration: 0 
        });
        
        setRouteSteps(steps);
        
        // Render complete route (solid line)
        routeLineRef.current = L.polyline(completeRoute, { color: ROUTE_COLOR, weight: 9, opacity: 0.98 }).addTo(routeLayerRef.current!);
        
        // Render dashed line from snap point to grave (dark grey, small dash)
        const finalLegCoords: Array<[number, number]> = [[snapPoint[0], snapPoint[1]], [graveLatLng.lat, graveLatLng.lng]];
        L.polyline(finalLegCoords, { 
          color: "#555555", 
          weight: 4, 
          opacity: 0.8,
          dashArray: "5, 8",
          lineCap: "butt"
        }).addTo(routeLayerRef.current!);
        
        console.log(`✅ Route calculated: ${(totalDistance/1000).toFixed(2)}km, ${Math.round(totalDuration/60)}min`);
      })
      .catch((err) => {
        console.warn("OSRM routing error, using direct line fallback:", err);
        
        // Fallback: Direct line from user to entrance
        const directDist = L.latLng(userLocation).distanceTo(L.latLng(entranceLocation));
        const entranceToSnapDist = routeOptimization.directDistance;
        const snapToGraveDist = L.latLng(snapPoint[0], snapPoint[1]).distanceTo(graveLatLng);
        
        const totalDistance = directDist + entranceToSnapDist + snapToGraveDist;
        const totalDuration = totalDistance / 1.4;
        
        setRouteInfo({ 
          distance: totalDistance / 1000,
          duration: totalDuration / 60
        });
        
        setRouteSteps([
          { 
            instruction: `⚠️ Using direct route. Head towards cemetery entrance.`, 
            distance: directDist, 
            duration: directDist / 1.4 
          },
          { 
            instruction: `📍 Follow the walking path inside cemetery.`, 
            distance: entranceToSnapDist,
            duration: entranceToSnapDist / 1.4
          },
          { 
            instruction: `✓ You have arrived at ${selectedGrave.grave_name}`, 
            distance: 0, 
            duration: 0 
          }
        ]);
        
        // Render fallback route
        const fallbackRoute: Array<[number, number]> = [
          [userLocation[0], userLocation[1]],
          [entranceLocation[0], entranceLocation[1]],
          ...internalPath
        ];
        routeLineRef.current = L.polyline(fallbackRoute, { color: ROUTE_COLOR, weight: 9, opacity: 0.98 }).addTo(routeLayerRef.current!);
        
        // Render dashed line from snap point to grave
        const finalLegCoords: Array<[number, number]> = [[snapPoint[0], snapPoint[1]], [graveLatLng.lat, graveLatLng.lng]];
        L.polyline(finalLegCoords, { 
          color: "#555555", 
          weight: 4, 
          opacity: 0.8,
          dashArray: "5, 8",
          lineCap: "butt"
        }).addTo(routeLayerRef.current!);
      });
  }, [selectedGrave, userLocation, mapConfig]);


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
          <div className="fixed inset-0 bg-black/40 z-[2000] flex items-end sm:items-center justify-center">
              <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:w-11/12 sm:max-w-md max-h-[80vh] flex flex-col">
                {/* Header - Always Visible */}
                <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-[#2d5f3f] to-[#1e3f2a]">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white truncate">
                        🎯 {selectedGrave.grave_name}
                      </h3>
                      <p className="text-xs text-gray-200">📍 {mapConfig.polygons.find(p => p.grave_id === selectedGrave.id)?.name || "Location"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                          onClick={() => setIsRouteCardCollapsed(!isRouteCardCollapsed)}
                          className="text-white hover:bg-white/20 p-2 rounded transition"
                          aria-label="Collapse/Expand"
                      >
                        {isRouteCardCollapsed ? "▲" : "▼"}
                      </button>
                      <button
                          onClick={handleCloseRouteCard}
                          className="text-white hover:bg-white/20 p-2 rounded transition"
                          aria-label="Close route details"
                      >
                          <X className="h-5 w-5" />
                      </button>
                    </div>
                </div>

                {/* Collapsible Content */}
                {!isRouteCardCollapsed && (
                  <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    {/* Distance and Time */}
                    <div className="grid grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg">
                      <div className="text-center">
                        <p className="text-xs text-gray-600">Distance</p>
                        <p className="text-lg font-bold text-[#2d5f3f]">{(routeInfo.distance).toFixed(1)} km</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-600">Time</p>
                        <p className="text-lg font-bold text-[#2d5f3f]">{Math.round(routeInfo.duration)} min</p>
                      </div>
                    </div>

                    {/* Voice Guide Button */}
                    <button
                        onClick={isSpeaking ? stopVoiceNavigation : startVoiceNavigation}
                        className={`w-full py-3 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 ${
                            isSpeaking 
                                ? "bg-red-500 hover:bg-red-600 text-white" 
                                : "bg-[#2d5f3f] hover:bg-[#1e3f2a] text-white"
                        }`}
                    >
                        <Volume2 className="h-4 w-4" />
                        {isSpeaking ? "Stop Voice" : "Start Voice"}
                    </button>

                    {/* Directions Header */}
                    <div>
                      <h4 className="font-semibold text-sm text-[#2d5f3f] mb-3">Directions:</h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {routeSteps.map((step, index) => {
                          // Handle both single-char arrows and multi-byte emoji
                          let iconChar = step.instruction.charAt(0);
                          let restOfText = step.instruction.substring(2);
                          let icon = iconChar;
                          
                          // Check for emoji/multi-byte characters (they take 2+ characters in JS string)
                          const firstTwo = step.instruction.substring(0, 2);
                          if (firstTwo === '📍' || firstTwo === '🎯' || firstTwo === '⚠️') {
                            iconChar = firstTwo;
                            restOfText = step.instruction.substring(3).trim(); // Skip emoji + space
                            icon = firstTwo;
                          }
                          
                          // Map icons to Tailwind styling
                          const getIconStyle = () => {
                            switch(iconChar) {
                              case '📍': return 'bg-blue-600 text-white rounded text-xs';
                              case '🎯': return 'bg-red-600 text-white rounded text-xs';
                              case '⚠️': return 'bg-yellow-600 text-white rounded text-xs';
                              case '↙': return 'bg-blue-500 text-white rounded transform rotate-45';
                              case '↗': return 'bg-purple-500 text-white rounded transform -rotate-45';
                              case '↑': return 'bg-green-500 text-white rounded';
                              case '⬅': return 'bg-red-500 text-white rounded transform rotate-90';
                              case '➡': return 'bg-orange-500 text-white rounded transform -rotate-90';
                              case '↖': return 'bg-indigo-500 text-white rounded transform rotate-135';
                              case '→': return 'bg-gray-600 text-white rounded';
                              case '⟳': return 'bg-yellow-500 text-white rounded-full';
                              case '⟲': return 'bg-yellow-600 text-white rounded-full transform -scale-x-100';
                              case '↓': return 'bg-pink-500 text-white rounded transform rotate-180';
                              case '▶': return 'bg-teal-500 text-white rounded';
                              case '✓': return 'bg-green-600 text-white rounded';
                              default: return 'bg-gray-500 text-white rounded';
                            }
                          };
                          
                          return (
                            <div key={index} className="flex gap-2 text-xs border-b pb-2 last:border-b-0">
                              <div className={`flex items-center justify-center w-6 h-6 flex-shrink-0 text-sm font-bold ${getIconStyle()}`}>
                                {icon}
                              </div>
                              <div className="flex-1">
                                <p className="font-medium leading-tight">{restOfText}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
      )}

      {/* --- Navigation Ready/View Route Button Card (Above Grave Details) --- */}
      {selectedGrave && userLocation && routeLineRef.current && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none w-full px-2 sm:px-4">
          <div className="pointer-events-auto max-w-md mx-auto">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-2xl p-3 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <button
                onClick={() => setSelectedGrave(null)}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-1 sm:p-1.5 rounded transition flex-shrink-0 self-end sm:self-auto"
                aria-label="Close"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <div className="flex-1 text-left">
                <p className="text-xs text-gray-500 font-medium">
                  Navigation ready to
                </p>
                <p className="font-bold text-base sm:text-lg truncate">
                  {selectedGrave.grave_name}
                </p>
              </div>
              <button
                onClick={() => setIsRouteCardVisible(true)}
                className="w-full sm:w-auto bg-[#2d5f3f] hover:bg-[#1e3f2a] text-white font-bold px-4 sm:px-8 py-2 sm:py-3 rounded-lg sm:rounded-xl shadow-lg text-sm sm:text-lg transition-all"
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