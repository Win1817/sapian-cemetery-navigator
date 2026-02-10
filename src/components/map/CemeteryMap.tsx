import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useToast } from "@/hooks/use-toast";
import { MAP_CONFIG } from "./mapConfig";
import { Layers, Volume2, X, MapPin, Trash2, Navigation } from "lucide-react";

// --- INTERFACES ---
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
  waypoint?: [number, number]; // Coordinate for proximity detection
  completed?: boolean;
}

interface NavigationState {
  isActive: boolean;
  currentStepIndex: number;
  distanceRemaining: number;
  timeRemaining: number;
  lastAnnouncedDistance: number;
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
const LOT_AVAILABLE_FILL = "#90EE90";
const LOT_AVAILABLE_STROKE = "#22C55E";
const LOT_OCCUPIED_FILL = "#FCA5A5";
const LOT_OCCUPIED_STROKE = "#DC2626";

// Navigation constants
const WALKING_SPEED_MS = 1.4; // meters per second (average walking speed)
const WAYPOINT_PROXIMITY_THRESHOLD = 15; // meters - when to trigger "approaching" announcement
const WAYPOINT_REACHED_THRESHOLD = 8; // meters - when to mark waypoint as reached
const DISTANCE_UPDATE_INTERVAL = 3000; // ms - how often to update distance announcements
const MIN_DISTANCE_CHANGE = 10; // meters - minimum change to trigger new announcement
const LOCATION_UPDATE_THROTTLE = 1000; // ms - throttle location updates

// --- WALKING PATH DEFINITION ---
interface WalkingPathPoint {
  coords: [number, number];
  label: string;
  description: string;
  index: number;
}

const walkingPathPoints: WalkingPathPoint[] = [
  {
    coords: [11.495096158301706, 122.60987221867981],
    label: "Main Entrance",
    description: "Primary cemetery entrance point - starting location for all routes",
    index: 0,
  },
  {
    coords: [11.494974808049491, 122.60987810662022],
    label: "Path Split / First Waypoint",
    description: "Initial waypoint after entering cemetery - path branches towards sections",
    index: 1,
  },
  {
    coords: [11.49499108737686, 122.60998547346168],
    label: "Upper Section Access",
    description: "Access point to upper cemetery section (Blocks 2-4)",
    index: 2,
  },
  {
    coords: [11.494157882612143, 122.61018592667318],
    label: "Far Upper Zone",
    description: "Furthest point in upper section - serves graves near index 3-4",
    index: 3,
  },
  {
    coords: [11.494028746061815, 122.60991432451885],
    label: "Upper Mid-Section Turn",
    description: "Turn point in upper-middle section - routes to outer lots",
    index: 4,
  },
  {
    coords: [11.494974656904034, 122.60987829227338],
    label: "Return to Entrance Loop",
    description: "Loop point returning towards main entrance - serves lower section graves",
    index: 5,
  },
];

const walkingPathCoords: [number, number][] = walkingPathPoints.map(p => p.coords);
const entranceLocation: [number, number] = walkingPathCoords[0];

const getWaypointLabel = (index: number): string => {
  const point = walkingPathPoints.find(p => p.index === index);
  return point ? `${point.label}` : `Waypoint ${index}`;
};

const getWaypointDescription = (index: number): string => {
  const point = walkingPathPoints.find(p => p.index === index);
  return point ? point.description : `Unnamed waypoint at index ${index}`;
};

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

const getClosestPointOnSegment = (target: L.LatLng, p1: L.LatLng, p2: L.LatLng): { point: L.LatLng; distance: number } => {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  const lengthSq = dx * dx + dy * dy;
  
  if (lengthSq === 0) {
    return { point: p1, distance: target.distanceTo(p1) };
  }
  
  let t = ((target.lng - p1.lng) * dx + (target.lat - p1.lat) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  
  const closestPoint = L.latLng(
    p1.lat + t * dy,
    p1.lng + t * dx
  );
  
  return {
    point: closestPoint,
    distance: target.distanceTo(closestPoint)
  };
};

const getClosestPointOnPath_LineString = (target: L.LatLng): { point: L.LatLng; segmentIndex: number } => {
  let closestPoint = walkingPathCoords[0];
  let closestDist = Infinity;
  let closestSegmentIndex = 0;
  
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

// Calculate precise distance along a path between two points
const calculatePathDistance = (path: [number, number][], startIdx: number = 0, endIdx?: number): number => {
  const end = endIdx ?? path.length - 1;
  let distance = 0;
  
  for (let i = startIdx; i < end; i++) {
    const from = L.latLng(path[i][0], path[i][1]);
    const to = L.latLng(path[i + 1][0], path[i + 1][1]);
    distance += from.distanceTo(to);
  }
  
  return distance;
};

// Calculate remaining distance from current location to destination along route
const calculateRemainingDistance = (
  currentLocation: [number, number],
  routePath: [number, number][],
  currentStepIndex: number
): number => {
  const currentLatLng = L.latLng(currentLocation[0], currentLocation[1]);
  
  // Find closest point on remaining route
  let minDist = Infinity;
  let closestSegmentIdx = currentStepIndex;
  
  for (let i = currentStepIndex; i < routePath.length - 1; i++) {
    const p1 = L.latLng(routePath[i][0], routePath[i][1]);
    const p2 = L.latLng(routePath[i + 1][0], routePath[i + 1][1]);
    const { distance } = getClosestPointOnSegment(currentLatLng, p1, p2);
    
    if (distance < minDist) {
      minDist = distance;
      closestSegmentIdx = i;
    }
  }
  
  // Calculate distance from current position to closest point on path
  const p1 = L.latLng(routePath[closestSegmentIdx][0], routePath[closestSegmentIdx][1]);
  const p2 = L.latLng(routePath[closestSegmentIdx + 1][0], routePath[closestSegmentIdx + 1][1]);
  const { point: closestPoint } = getClosestPointOnSegment(currentLatLng, p1, p2);
  
  let remainingDist = currentLatLng.distanceTo(closestPoint);
  
  // Add distance from closest point to end of that segment
  remainingDist += closestPoint.distanceTo(p2);
  
  // Add remaining segments
  for (let i = closestSegmentIdx + 1; i < routePath.length - 1; i++) {
    const from = L.latLng(routePath[i][0], routePath[i][1]);
    const to = L.latLng(routePath[i + 1][0], routePath[i + 1][1]);
    remainingDist += from.distanceTo(to);
  }
  
  return remainingDist;
};

const calculateOptimizedRoute = (graveLatLng: L.LatLng, userLoc: [number, number], entranceLoc: [number, number]) => {
  const { point: nearestPathPoint, segmentIndex } = getClosestPointOnPath_LineString(graveLatLng);
  const nearestPoint: [number, number] = [nearestPathPoint.lat, nearestPathPoint.lng];
  
  const entranceLatLng = L.latLng(entranceLoc[0], entranceLoc[1]);
  const nearestPathLatLng = L.latLng(nearestPoint[0], nearestPoint[1]);
  
  let adjustedSegmentIndex = segmentIndex;
  if (segmentIndex === 3) {
    const distToWaypoint4 = graveLatLng.distanceTo(L.latLng(walkingPathCoords[4][0], walkingPathCoords[4][1]));
    const distToWaypoint3 = graveLatLng.distanceTo(L.latLng(walkingPathCoords[3][0], walkingPathCoords[3][1]));
    
    if (distToWaypoint4 < distToWaypoint3) {
      adjustedSegmentIndex = 4;
    }
  }
  
  let pathToFollow: [number, number][] = [];
  let routeDescription = '';
  let routeWaypoints: string[] = [getWaypointLabel(0)];
  
  pathToFollow.push(walkingPathCoords[0]);
  
  if (adjustedSegmentIndex <= 1) {
    routeDescription = `LOWER SECTION (near entrance)`;
    pathToFollow.push(walkingPathCoords[1]);
    routeWaypoints.push(getWaypointLabel(1));
    pathToFollow.push(nearestPoint);
    routeWaypoints.push("Snap to Grave");
    
  } else if (adjustedSegmentIndex <= 3) {
    routeDescription = `MIDDLE SECTION (forward route, segment ${adjustedSegmentIndex})`;
    pathToFollow.push(walkingPathCoords[1]);
    routeWaypoints.push(getWaypointLabel(1));
    pathToFollow.push(walkingPathCoords[2]);
    routeWaypoints.push(getWaypointLabel(2));
    
    if (adjustedSegmentIndex === 3) {
      pathToFollow.push(walkingPathCoords[3]);
      routeWaypoints.push(getWaypointLabel(3));
    }
    
    pathToFollow.push(nearestPoint);
    routeWaypoints.push("Snap to Grave");
    
  } else if (adjustedSegmentIndex === 4) {
    const distToWaypoint5 = graveLatLng.distanceTo(L.latLng(walkingPathCoords[5][0], walkingPathCoords[5][1]));
    const distToWaypoint4 = graveLatLng.distanceTo(L.latLng(walkingPathCoords[4][0], walkingPathCoords[4][1]));
    
    pathToFollow.push(walkingPathCoords[1]);
    routeWaypoints.push(getWaypointLabel(1));
    
    pathToFollow.push(walkingPathCoords[5]);
    routeWaypoints.push(getWaypointLabel(5));
    
    if (distToWaypoint4 < distToWaypoint5) {
      routeDescription = `SEGMENT 4 (backward route - going through waypoint 4)`;
      pathToFollow.push(walkingPathCoords[4]);
      routeWaypoints.push(getWaypointLabel(4));
    } else {
      routeDescription = `SEGMENT 4 (backward route - snap from waypoint 5)`;
    }
    
    pathToFollow.push(nearestPoint);
    routeWaypoints.push("Snap to Grave");
    
  } else {
    routeDescription = `UPPER SECTION (backward/loop route, segment ${adjustedSegmentIndex})`;
    
    pathToFollow.push(walkingPathCoords[1]);
    routeWaypoints.push(getWaypointLabel(1));
    
    pathToFollow.push(walkingPathCoords[5]);
    routeWaypoints.push(getWaypointLabel(5));
    
    pathToFollow.push(nearestPoint);
    routeWaypoints.push("Snap to Grave");
  }
  
  let pathDistance = calculatePathDistance(pathToFollow);
  
  return {
    nearestPathPoint: nearestPathLatLng,
    internalPath: pathToFollow,
    directDistance: pathDistance,
    segmentIndex: adjustedSegmentIndex,
    section: routeDescription,
    waypoints: routeWaypoints,
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
  const customStartMarkerRef = useRef<L.CircleMarker | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const navigationWatchIdRef = useRef<number | null>(null);
  const lastLocationUpdateRef = useRef<number>(0);
  const fullRoutePathRef = useRef<[number, number][]>([]);
  const lastAnnouncementTimeRef = useRef<number>(0);

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
  const [customStartLocation, setCustomStartLocation] = useState<[number, number] | null>(null);
  const [isSettingStartLocation, setIsSettingStartLocation] = useState(false);
  const [showStartLocationSearch, setShowStartLocationSearch] = useState(false);
  const [startLocationQuery, setStartLocationQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Enhanced navigation state
  const [navigationState, setNavigationState] = useState<NavigationState>({
    isActive: false,
    currentStepIndex: 0,
    distanceRemaining: 0,
    timeRemaining: 0,
    lastAnnouncedDistance: 0,
  });

  const { toast } = useToast();

  // 🎯 ENHANCED VOICE NAVIGATION WITH LIVE TRACKING
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Helper function to speak with better voice
  const speak = useCallback((text: string, priority: 'high' | 'normal' = 'normal') => {
    if (!synthRef.current) return;

    // Cancel lower priority speech
    if (priority === 'high' && synthRef.current.speaking) {
      synthRef.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthRef.current.getVoices();
    const preferredVoice = voices.find(v => 
      v.lang.startsWith('en-US') && v.localService
    ) || voices[0];
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.rate = 0.95; // Slightly slower for clarity
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    synthRef.current.speak(utterance);
  }, []);

  // Format distance for voice announcement
  const formatDistanceForVoice = (meters: number): string => {
    if (meters < 50) {
      return `${Math.round(meters)} meters`;
    } else if (meters < 1000) {
      return `${Math.round(meters / 10) * 10} meters`;
    } else {
      return `${(meters / 1000).toFixed(1)} kilometers`;
    }
  };

  // Format time for voice announcement
  const formatTimeForVoice = (seconds: number): string => {
    if (seconds < 60) {
      return `${Math.round(seconds)} seconds`;
    } else if (seconds < 3600) {
      const mins = Math.round(seconds / 60);
      return `${mins} minute${mins !== 1 ? 's' : ''}`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.round((seconds % 3600) / 60);
      return `${hours} hour${hours !== 1 ? 's' : ''} and ${mins} minute${mins !== 1 ? 's' : ''}`;
    }
  };

  // Live tracking - monitor user's progress
  const updateNavigationProgress = useCallback((currentLocation: [number, number]) => {
    if (!navigationState.isActive || !selectedGrave || fullRoutePathRef.current.length === 0) {
      return;
    }

    const now = Date.now();
    
    // Throttle updates
    if (now - lastLocationUpdateRef.current < LOCATION_UPDATE_THROTTLE) {
      return;
    }
    lastLocationUpdateRef.current = now;

    const currentLatLng = L.latLng(currentLocation[0], currentLocation[1]);
    
    // Calculate remaining distance
    const remainingDist = calculateRemainingDistance(
      currentLocation,
      fullRoutePathRef.current,
      navigationState.currentStepIndex
    );
    
    // Calculate remaining time based on walking speed
    const remainingTime = remainingDist / WALKING_SPEED_MS;

    // Check if approaching or reached any waypoint
    for (let i = navigationState.currentStepIndex; i < routeSteps.length; i++) {
      const step = routeSteps[i];
      if (!step.waypoint || step.completed) continue;

      const waypointLatLng = L.latLng(step.waypoint[0], step.waypoint[1]);
      const distToWaypoint = currentLatLng.distanceTo(waypointLatLng);

      // Waypoint reached
      if (distToWaypoint <= WAYPOINT_REACHED_THRESHOLD) {
        console.log(`✅ Reached waypoint at step ${i}: ${step.instruction}`);
        
        // Mark step as completed
        const updatedSteps = [...routeSteps];
        updatedSteps[i].completed = true;
        setRouteSteps(updatedSteps);

        // Move to next step
        if (i < routeSteps.length - 1) {
          setNavigationState(prev => ({
            ...prev,
            currentStepIndex: i + 1,
            distanceRemaining: remainingDist,
            timeRemaining: remainingTime,
          }));

          // Announce next step
          const nextStep = routeSteps[i + 1];
          if (nextStep) {
            speak(nextStep.instruction, 'high');
            
            // Add distance info if available
            if (nextStep.distance > 0) {
              setTimeout(() => {
                speak(`Distance to next point: ${formatDistanceForVoice(nextStep.distance)}`);
              }, 2000);
            }
          }
        } else {
          // Reached final destination
          speak(`You have arrived at ${selectedGrave.grave_name}. Navigation complete.`, 'high');
          setNavigationState(prev => ({
            ...prev,
            isActive: false,
            distanceRemaining: 0,
            timeRemaining: 0,
          }));
        }
        break;
      }
      // Approaching waypoint
      else if (
        distToWaypoint <= WAYPOINT_PROXIMITY_THRESHOLD &&
        distToWaypoint > WAYPOINT_REACHED_THRESHOLD &&
        now - lastAnnouncementTimeRef.current > DISTANCE_UPDATE_INTERVAL
      ) {
        speak(`Approaching ${step.instruction.split('.')[0]}`, 'normal');
        lastAnnouncementTimeRef.current = now;
        break;
      }
    }

    // Periodic distance updates
    if (
      now - lastAnnouncementTimeRef.current > DISTANCE_UPDATE_INTERVAL &&
      Math.abs(remainingDist - navigationState.lastAnnouncedDistance) > MIN_DISTANCE_CHANGE
    ) {
      const distanceText = formatDistanceForVoice(remainingDist);
      const timeText = formatTimeForVoice(remainingTime);
      
      speak(`${distanceText} remaining. Estimated time: ${timeText}`, 'normal');
      
      setNavigationState(prev => ({
        ...prev,
        lastAnnouncedDistance: remainingDist,
      }));
      
      lastAnnouncementTimeRef.current = now;
    }

    // Update state with current distance and time
    setNavigationState(prev => ({
      ...prev,
      distanceRemaining: remainingDist,
      timeRemaining: remainingTime,
    }));

  }, [navigationState, routeSteps, selectedGrave, speak]);

  // Watch user location when navigation is active
  useEffect(() => {
    if (navigationState.isActive && userLocation) {
      updateNavigationProgress(userLocation);
    }
  }, [userLocation, navigationState.isActive, updateNavigationProgress]);

  const stopVoiceNavigation = useCallback(() => {
    if (synthRef.current && synthRef.current.speaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
    
    setNavigationState({
      isActive: false,
      currentStepIndex: 0,
      distanceRemaining: 0,
      timeRemaining: 0,
      lastAnnouncedDistance: 0,
    });

    // Reset completed flags
    setRouteSteps(prev => prev.map(step => ({ ...step, completed: false })));
  }, []);

  const startVoiceNavigation = useCallback(() => {
    if (!synthRef.current || routeSteps.length === 0 || !selectedGrave || !routeInfo) {
      toast({
        title: "Navigation unavailable",
        description: "Please ensure you have a valid route calculated",
        variant: "destructive",
      });
      return;
    }

    // Stop any existing speech
    stopVoiceNavigation();

    setIsSpeaking(true);
    setNavigationState({
      isActive: true,
      currentStepIndex: 0,
      distanceRemaining: routeInfo.distance * 1000,
      timeRemaining: routeInfo.duration * 60,
      lastAnnouncedDistance: routeInfo.distance * 1000,
    });

    // Initial welcome message
    const welcomeText = `Starting live navigation to ${selectedGrave.grave_name}. ` +
      `Total distance is ${formatDistanceForVoice(routeInfo.distance * 1000)}. ` +
      `Estimated time is ${formatTimeForVoice(routeInfo.duration * 60)}. ` +
      `I will guide you step by step and update you on your progress.`;
    
    speak(welcomeText, 'high');

    // Announce first step after welcome
    setTimeout(() => {
      if (routeSteps[0]) {
        speak(routeSteps[0].instruction, 'high');
      }
    }, 6000);

    toast({
      title: "Live Navigation Started",
      description: "Voice guidance is now active. You'll receive updates as you walk.",
      duration: 4000,
    });
  }, [routeSteps, selectedGrave, routeInfo, speak, stopVoiceNavigation, toast]);

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

  const clearCustomStartLocation = () => {
    setCustomStartLocation(null);
    setShowStartLocationSearch(false);
    setStartLocationQuery("");
    setSearchResults([]);
    if (customStartMarkerRef.current) {
      customStartMarkerRef.current.remove();
      customStartMarkerRef.current = null;
    }
    toast({
      title: "Start location cleared",
      description: "Using device location for routing",
      duration: 3000,
    });
  };

  const searchPlace = async (query: string) => {
    if (!query || query.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?` +
        `format=json&q=${encodeURIComponent(query)}&` +
        `limit=5&addressdetails=1`,
        {
          headers: {
            'Accept': 'application/json',
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({
        title: "Search error",
        description: "Could not search for location. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchInputChange = (value: string) => {
    setStartLocationQuery(value);
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchPlace(value);
    }, 500);
  };

  const selectSearchResult = (result: any) => {
    const lat = parseFloat(result.lat);
    const lon = parseFloat(result.lon);
    
    setCustomStartLocation([lat, lon]);
    setShowStartLocationSearch(false);
    setIsSettingStartLocation(false);
    setStartLocationQuery(result.display_name);
    setSearchResults([]);
    
    if (mapRef.current) {
      mapRef.current.setView([lat, lon], 15);
    }
    
    toast({
      title: "Start location set",
      description: result.display_name.split(',').slice(0, 2).join(','),
      duration: 3000,
    });
  };

  // MAP INIT
  useEffect(() => {
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

    return () => {
      stopVoiceNavigation();
    };
  }, [stopVoiceNavigation]);

  // Handle map clicks for setting start location
  useEffect(() => {
    if (!mapRef.current) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isSettingStartLocation) return;
      
      const { lat, lng } = e.latlng;
      setCustomStartLocation([lat, lng]);
      setIsSettingStartLocation(false);
      
      toast({
        title: "Start location set",
        description: "Route will be calculated from your chosen location",
        duration: 3000,
      });
    };

    mapRef.current.on('click', handleMapClick);

    return () => {
      if (mapRef.current) {
        mapRef.current.off('click', handleMapClick);
      }
    };
  }, [isSettingStartLocation, toast]);

  // Update cursor style
  useEffect(() => {
    if (!mapRef.current) return;
    
    const mapContainer = mapRef.current.getContainer();
    if (isSettingStartLocation) {
      mapContainer.style.cursor = 'crosshair';
    } else {
      mapContainer.style.cursor = '';
    }
  }, [isSettingStartLocation]);

  // CEMETERY POLYGONS
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

      if (p.type === "lot" || p.type === "block") { 
        const latSum = p.coordinates.reduce((sum, coord) => sum + coord[0], 0);
        const lngSum = p.coordinates.reduce((sum, coord) => sum + coord[1], 0);
        const centroidLat = latSum / p.coordinates.length;
        const centroidLng = lngSum / p.coordinates.length;

        const parts = p.name.split(' - ');
        let labelText = '';
        
        parts.forEach((part: string, idx: number) => {
          const tokens = part.trim().split(' ');
          let label = tokens[0].charAt(0);
          if (tokens[1]) {
            label += tokens[1];
          }
          labelText += label;
          if (idx < parts.length - 1) labelText += '-';
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

  // USER LOCATION & CUSTOM START LOCATION
  useEffect(() => {
    if (!overlayLayerRef.current) return;
    
    if (userLocation) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(userLocation);
      } else {
        userMarkerRef.current = L.circleMarker(userLocation, { 
          radius: 16, 
          color: "#2d5f3f", 
          weight: 6, 
          fillColor: "#f4d03f", 
          fillOpacity: 1 
        }).addTo(overlayLayerRef.current);
      }
    }
    
    if (customStartLocation) {
      if (customStartMarkerRef.current) {
        customStartMarkerRef.current.setLatLng(customStartLocation);
      } else {
        customStartMarkerRef.current = L.circleMarker(customStartLocation, { 
          radius: 18, 
          color: "#DC2626", 
          weight: 4, 
          fillColor: "#FCA5A5", 
          fillOpacity: 0.9 
        }).addTo(overlayLayerRef.current);
        
        const markerIcon = L.divIcon({
          html: `<div style="background:#DC2626;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;white-space:nowrap;">START</div>`,
          iconSize: [45, 20],
          iconAnchor: [22, -25],
          className: "",
        });
        L.marker(customStartLocation, {
          icon: markerIcon,
          zIndexOffset: 999,
        }).addTo(overlayLayerRef.current);
      }
    } else if (customStartMarkerRef.current) {
      customStartMarkerRef.current.remove();
      customStartMarkerRef.current = null;
    }
  }, [userLocation, customStartLocation]);

  // ROUTING
  useEffect(() => {
    const effectiveStartLocation = customStartLocation || userLocation;
    
    if (!selectedGrave || !effectiveStartLocation || !mapRef.current || !routeLayerRef.current) {
      routeLayerRef.current?.clearLayers();
      overlayLayerRef.current?.clearLayers();
      routeLineRef.current = null;
      fullRoutePathRef.current = [];
      setRouteInfo(null);
      setRouteSteps([]);
      setIsRouteCardVisible(false);
      stopVoiceNavigation();
      
      if (userLocation && userMarkerRef.current) userMarkerRef.current.addTo(overlayLayerRef.current!);
      if (customStartLocation && customStartMarkerRef.current) {
        customStartMarkerRef.current.addTo(overlayLayerRef.current!);
        const markerIcon = L.divIcon({
          html: `<div style="background:#DC2626;color:white;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:bold;white-space:nowrap;">START</div>`,
          iconSize: [45, 20],
          iconAnchor: [22, -25],
          className: "",
        });
        L.marker(customStartLocation, {
          icon: markerIcon,
          zIndexOffset: 999,
        }).addTo(overlayLayerRef.current!);
      }
      return;
    }

    routeLayerRef.current.clearLayers();
    overlayLayerRef.current.clearLayers();
    routeLineRef.current?.remove();
    stopVoiceNavigation();

    const polygon = mapConfig.polygons.find((p) => p.grave_id === selectedGrave.id);
    if (!polygon) {
      return;
    }

    const latSum = polygon.coordinates.reduce((sum, coord) => sum + coord[0], 0);
    const lngSum = polygon.coordinates.reduce((sum, coord) => sum + coord[1], 0);
    const centroidLat = latSum / polygon.coordinates.length;
    const centroidLng = lngSum / polygon.coordinates.length;

    const graveLatLng = L.latLng(centroidLat, centroidLng);
    
    const routeOptimization = calculateOptimizedRoute(graveLatLng, effectiveStartLocation, entranceLocation);
    const nearestPathPoint = routeOptimization.nearestPathPoint;
    const internalPath = routeOptimization.internalPath;
    const snapPoint: [number, number] = [nearestPathPoint.lat, nearestPathPoint.lng];

    // Grave Highlight Marker
    const pulsing = L.divIcon({
      html: `<div style="width:36px;height:36px;border-radius:50%;background:#2563eb;border:4px solid white;box-shadow:0 0 30px #2563ebc0;animation:pulse 2s infinite;"></div>`,
      className: "pulsing-marker",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    
    L.marker(graveLatLng, { icon: pulsing, zIndexOffset: 9999 }).addTo(overlayLayerRef.current!).bindPopup(`<div style="min-width:160px;"><div style="padding:8px;border-bottom:2px solid #2d5f3f;margin-bottom:6px;"><div style="font-weight:bold;font-size:12px;color:#2d5f3f;">${selectedGrave.grave_name}</div></div><div style="padding:6px;"><div style="font-size:11px;color:#666;"><span style="color:#999;font-weight:500;">Location:</span> ${polygon.name}</div></div></div>`).openPopup();
    mapRef.current.setView(graveLatLng, 19);

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

    const startLng = effectiveStartLocation[1];
    const startLat = effectiveStartLocation[0];
    const entranceLng = entranceLocation[1];
    const entranceLat = entranceLocation[0];
    
    const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${entranceLng},${entranceLat}?overview=full&geometries=geojson`;
    
    fetch(osrmUrl)
      .then((r) => r.json())
      .then((data) => {
        let externalRouteCoords: [number, number][] = [];
        let externalDistance = 0;
        let externalDuration = 0;
        
        if (data.routes && data.routes[0]) {
          const route = data.routes[0];
          const geometry = route.geometry;
          
          if (geometry.coordinates) {
            externalRouteCoords = geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          }
          
          externalDistance = route.distance || 0;
          externalDuration = route.duration || 0;
        }
        
        const completeRoute = [...externalRouteCoords, ...internalPath];
        fullRoutePathRef.current = completeRoute;
        
        const entranceToSnapDist = routeOptimization.directDistance;
        const snapToGraveDist = L.latLng(snapPoint[0], snapPoint[1]).distanceTo(graveLatLng);
        
        const totalDistance = externalDistance + entranceToSnapDist + snapToGraveDist;
        const totalDuration = totalDistance / WALKING_SPEED_MS; // More accurate time calculation
        
        setRouteInfo({ 
          distance: totalDistance / 1000,
          duration: totalDuration / 60
        });
        
        const steps: RouteStep[] = [];
        
        const startLocationLabel = customStartLocation ? "your chosen location" : "your current location";
        
        // Step 1: External route
        steps.push({
          instruction: `Walk from ${startLocationLabel} to cemetery entrance`,
          distance: externalDistance,
          duration: externalDistance / WALKING_SPEED_MS,
          waypoint: entranceLocation,
        });
        
        // Step 2: Enter cemetery
        steps.push({ 
          instruction: `Enter cemetery through the main entrance`, 
          distance: 0, 
          duration: 0,
          waypoint: internalPath[1],
        });
        
        // Step 3: Navigate internal path
        steps.push({ 
          instruction: `Follow the walking path towards ${polygon.name}`, 
          distance: entranceToSnapDist,
          duration: entranceToSnapDist / WALKING_SPEED_MS,
          waypoint: snapPoint,
        });
        
        // Step 4: Final approach
        steps.push({ 
          instruction: `Walk to the grave site`, 
          distance: snapToGraveDist,
          duration: snapToGraveDist / WALKING_SPEED_MS,
          waypoint: [centroidLat, centroidLng],
        });
        
        // Step 5: Arrival
        steps.push({ 
          instruction: `You have arrived at ${selectedGrave.grave_name}`, 
          distance: 0, 
          duration: 0,
          waypoint: [centroidLat, centroidLng],
        });
        
        setRouteSteps(steps);
        
        routeLineRef.current = L.polyline(completeRoute, { color: ROUTE_COLOR, weight: 9, opacity: 0.98 }).addTo(routeLayerRef.current!);
        
        const finalLegCoords: Array<[number, number]> = [[snapPoint[0], snapPoint[1]], [graveLatLng.lat, graveLatLng.lng]];
        L.polyline(finalLegCoords, { 
          color: "#555555", 
          weight: 4, 
          opacity: 0.8,
          dashArray: "5, 8",
          lineCap: "butt"
        }).addTo(routeLayerRef.current!);
      })
      .catch((err) => {
        console.warn("OSRM routing error, using direct line fallback:", err);
        
        const directDist = L.latLng(effectiveStartLocation).distanceTo(L.latLng(entranceLocation));
        const entranceToSnapDist = routeOptimization.directDistance;
        const snapToGraveDist = L.latLng(snapPoint[0], snapPoint[1]).distanceTo(graveLatLng);
        
        const totalDistance = directDist + entranceToSnapDist + snapToGraveDist;
        const totalDuration = totalDistance / WALKING_SPEED_MS;
        
        const completeRoute = [
          [effectiveStartLocation[0], effectiveStartLocation[1]],
          [entranceLocation[0], entranceLocation[1]],
          ...internalPath
        ];
        fullRoutePathRef.current = completeRoute;
        
        setRouteInfo({ 
          distance: totalDistance / 1000,
          duration: totalDuration / 60
        });
        
        const startLocationLabel = customStartLocation ? "your chosen location" : "your current location";
        setRouteSteps([
          { 
            instruction: `Using direct route. Head from ${startLocationLabel} towards cemetery entrance`, 
            distance: directDist, 
            duration: directDist / WALKING_SPEED_MS,
            waypoint: entranceLocation,
          },
          { 
            instruction: `Follow the walking path inside cemetery`, 
            distance: entranceToSnapDist,
            duration: entranceToSnapDist / WALKING_SPEED_MS,
            waypoint: snapPoint,
          },
          { 
            instruction: `You have arrived at ${selectedGrave.grave_name}`, 
            distance: 0, 
            duration: 0,
            waypoint: [centroidLat, centroidLng],
          }
        ]);
        
        routeLineRef.current = L.polyline(completeRoute, { color: ROUTE_COLOR, weight: 9, opacity: 0.98 }).addTo(routeLayerRef.current!);
        
        const finalLegCoords: Array<[number, number]> = [[snapPoint[0], snapPoint[1]], [graveLatLng.lat, graveLatLng.lng]];
        L.polyline(finalLegCoords, { 
          color: "#555555", 
          weight: 4, 
          opacity: 0.8,
          dashArray: "5, 8",
          lineCap: "butt"
        }).addTo(routeLayerRef.current!);
      });
  }, [selectedGrave, userLocation, customStartLocation, mapConfig, stopVoiceNavigation]);

  const handleCloseRouteCard = () => {
    setIsRouteCardVisible(false);
    stopVoiceNavigation();
  };

  // RENDER
  return (
    <div className="relative w-full h-screen md:h-full overflow-hidden">
      <div ref={mapContainerRef} className="absolute inset-0 z-0" />
      
      {/* Layer Selector & Start Location UI */}
      <div className="absolute top-4 right-4 z-[1200] flex flex-col gap-2">
        <button
          onClick={() => setIsLayerSelectorVisible(!isLayerSelectorVisible)}
          className="bg-white p-2 rounded-md shadow-lg hover:bg-gray-50 transition"
          title="Change map layer"
        >
          <Layers className="h-5 w-5" />
        </button>
        
        <button
          onClick={() => {
            setShowStartLocationSearch(!showStartLocationSearch);
            setIsSettingStartLocation(false);
          }}
          className={`p-2 rounded-md shadow-lg transition ${
            showStartLocationSearch 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-white hover:bg-gray-50'
          }`}
          title="Set custom start location"
        >
          <MapPin className="h-5 w-5" />
        </button>
        
        {customStartLocation && (
          <button
            onClick={clearCustomStartLocation}
            className="bg-red-600 text-white p-2 rounded-md shadow-lg hover:bg-red-700 transition"
            title="Clear custom start location"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        )}
        
        {isLayerSelectorVisible && (
          <div className="absolute top-full right-0 mt-2 bg-white rounded-md shadow-lg p-2 flex flex-col gap-2 z-[1300]">
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

      {isSettingStartLocation && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1300] bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium">
          Click anywhere on the map to set your start location
        </div>
      )}

      {/* Live Navigation Status Bar */}
      {navigationState.isActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1200] bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg">
          <div className="flex items-center gap-3">
            <Navigation className="h-5 w-5 animate-pulse" />
            <div className="text-sm font-medium">
              <div>Live Navigation Active</div>
              <div className="text-xs opacity-90">
                {formatDistanceForVoice(navigationState.distanceRemaining)} • {formatTimeForVoice(navigationState.timeRemaining)} remaining
              </div>
            </div>
          </div>
        </div>
      )}

      {showStartLocationSearch && (
        <div className="absolute top-4 left-4 z-[1300] w-80 sm:w-96 bg-white rounded-lg shadow-2xl overflow-hidden">
          <div className="p-3 bg-gradient-to-r from-[#2d5f3f] to-[#1e3f2a] text-white">
            <h3 className="font-bold text-sm">Set Start Location</h3>
          </div>
          
          <div className="p-3 space-y-2">
            <div className="relative">
              <input
                type="text"
                value={startLocationQuery}
                onChange={(e) => handleSearchInputChange(e.target.value)}
                placeholder="Search for address or place..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#2d5f3f] text-sm"
                autoFocus
              />
              {isSearching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-[#2d5f3f] border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </div>

            {searchResults.length > 0 && (
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-md">
                {searchResults.map((result, index) => (
                  <button
                    key={index}
                    onClick={() => selectSearchResult(result)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b last:border-b-0 transition"
                  >
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {result.display_name.split(',')[0]}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {result.display_name.split(',').slice(1).join(',')}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-gray-300"></div>
              <span className="text-xs text-gray-500 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-300"></div>
            </div>

            <button
              onClick={() => {
                setIsSettingStartLocation(true);
                setShowStartLocationSearch(false);
              }}
              className="w-full bg-white border-2 border-[#2d5f3f] text-[#2d5f3f] py-2 rounded-md font-medium text-sm hover:bg-[#2d5f3f] hover:text-white transition"
            >
              Click on Map to Set Location
            </button>

            <button
              onClick={() => {
                setShowStartLocationSearch(false);
                setStartLocationQuery("");
                setSearchResults([]);
              }}
              className="w-full bg-gray-200 text-gray-700 py-2 rounded-md font-medium text-sm hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Route Card Modal - Keeping existing UI but with enhanced voice button */}
      {isRouteCardVisible && routeInfo && selectedGrave && (
          <div className="fixed inset-0 bg-black/40 z-[2000] flex items-end sm:items-center justify-center">
              <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:w-11/12 sm:max-w-md max-h-[80vh] flex flex-col">
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

                {!isRouteCardCollapsed && (
                  <div className="overflow-y-auto flex-1 p-4 space-y-4">
                    <div className="relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-[#2d5f3f]/5 to-[#5D866C]/5 rounded-lg"></div>
                      
                      <div className="relative grid grid-cols-2 gap-4 p-4 rounded-lg border border-[#2d5f3f]/20">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <svg className="w-5 h-5 text-[#2d5f3f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                            </svg>
                            <p className="text-xs font-medium text-gray-600">Distance</p>
                          </div>
                          <p className="text-2xl font-bold text-[#2d5f3f]">
                            {navigationState.isActive 
                              ? (navigationState.distanceRemaining / 1000).toFixed(1)
                              : routeInfo.distance.toFixed(1)}
                          </p>
                          <p className="text-xs text-gray-500">kilometers</p>
                        </div>
                        <div className="text-center border-l border-gray-200">
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <svg className="w-5 h-5 text-[#2d5f3f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-xs font-medium text-gray-600">Est. Time</p>
                          </div>
                          <p className="text-2xl font-bold text-[#2d5f3f]">
                            {navigationState.isActive
                              ? Math.round(navigationState.timeRemaining / 60)
                              : Math.round(routeInfo.duration)}
                          </p>
                          <p className="text-xs text-gray-500">minutes</p>
                        </div>
                      </div>
                      
                      <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded text-xs text-blue-700 flex items-center gap-2">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>
                          {navigationState.isActive 
                            ? "Live tracking active • Real-time updates" 
                            : "Walking pace • Actual time may vary"}
                        </span>
                      </div>
                    </div>

                    {/* Enhanced Voice Navigation Button */}
                    <button
                        onClick={navigationState.isActive ? stopVoiceNavigation : startVoiceNavigation}
                        className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 shadow-md ${
                            navigationState.isActive
                                ? "bg-red-500 hover:bg-red-600 text-white animate-pulse" 
                                : "bg-gradient-to-r from-[#2d5f3f] to-[#1e3f2a] hover:from-[#1e3f2a] hover:to-[#2d5f3f] text-white"
                        }`}
                    >
                        {navigationState.isActive ? (
                          <>
                            <X className="h-5 w-5" />
                            Stop Live Navigation
                          </>
                        ) : (
                          <>
                            <Navigation className="h-5 w-5" />
                            Start Live Navigation
                          </>
                        )}
                    </button>

                    {navigationState.isActive && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <Navigation className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5 animate-pulse" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-green-800 mb-1">Live Navigation Active</p>
                            <p className="text-xs text-green-700">
                              Currently at Step {navigationState.currentStepIndex + 1} of {routeSteps.length}
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                              You'll receive voice updates as you progress along the route
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {!navigationState.isActive && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-amber-800 mb-1">Live Navigation Features</p>
                            <ul className="text-xs text-amber-700 space-y-1">
                              <li className="flex items-start gap-1">
                                <span className="text-amber-500 flex-shrink-0">•</span>
                                <span>Real-time distance and time updates</span>
                              </li>
                              <li className="flex items-start gap-1">
                                <span className="text-amber-500 flex-shrink-0">•</span>
                                <span>Automatic waypoint detection</span>
                              </li>
                              <li className="flex items-start gap-1">
                                <span className="text-amber-500 flex-shrink-0">•</span>
                                <span>Hands-free voice guidance</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Step by step directions */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-sm text-[#2d5f3f]">Step-by-Step Directions</h4>
                        <span className="text-xs text-gray-500">{routeSteps.length} steps</span>
                      </div>
                      
                      <div className="mb-4">
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-[#2d5f3f] to-[#5D866C] transition-all duration-500"
                            style={{
                              width: navigationState.isActive 
                                ? `${((navigationState.currentStepIndex) / routeSteps.length) * 100}%`
                                : '0%'
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1 text-center">
                          {navigationState.isActive 
                            ? `Step ${navigationState.currentStepIndex + 1} of ${routeSteps.length}`
                            : 'Ready to navigate'}
                        </p>
                      </div>

                      <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                        {routeSteps.map((step, index) => {
                          const isCurrentStep = navigationState.isActive && index === navigationState.currentStepIndex;
                          const isCompletedStep = navigationState.isActive && index < navigationState.currentStepIndex;
                          const isLastStep = index === routeSteps.length - 1;
                          
                          return (
                            <div key={index} className={`relative ${!isLastStep ? 'pb-3' : ''}`}>
                              {!isLastStep && (
                                <div className={`absolute left-5 top-10 bottom-0 w-0.5 ${
                                  isCompletedStep ? 'bg-green-400' : 'bg-gray-300'
                                }`}></div>
                              )}
                              
                              <div className={`relative bg-white border rounded-lg p-3 transition-all ${
                                isCurrentStep ? 'border-l-4 border-l-green-500 shadow-md ring-2 ring-green-200' :
                                isCompletedStep ? 'border-l-4 border-l-green-400 opacity-60' :
                                isLastStep ? 'border-l-4 border-l-blue-500' :
                                'border-gray-200'
                              }`}>
                                <div className="flex gap-3">
                                  <div className="flex-shrink-0">
                                    <div className={`w-10 h-10 rounded-full text-white flex items-center justify-center font-bold shadow-md ${
                                      isCompletedStep ? 'bg-green-500' :
                                      isCurrentStep ? 'bg-green-600 animate-pulse' :
                                      isLastStep ? 'bg-blue-600' :
                                      'bg-gray-400'
                                    }`}>
                                      {isCompletedStep ? (
                                        <span className="text-lg">✓</span>
                                      ) : (
                                        <span className="text-sm">{index + 1}</span>
                                      )}
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <p className={`font-medium leading-snug mb-1 ${
                                      isCurrentStep ? 'text-green-700 font-bold' :
                                      isCompletedStep ? 'text-gray-500' :
                                      'text-gray-800'
                                    }`}>
                                      {step.instruction}
                                    </p>
                                    
                                    {step.distance > 0 && !isCompletedStep && (
                                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                                        <div className="flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                          </svg>
                                          <span>{formatDistanceForVoice(step.distance)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span>{formatTimeForVoice(step.duration)}</span>
                                        </div>
                                      </div>
                                    )}
                                    
                                    {isCurrentStep && (
                                      <div className="mt-2">
                                        <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium animate-pulse">
                                          Current Step
                                        </span>
                                      </div>
                                    )}
                                    {isCompletedStep && (
                                      <div className="mt-2">
                                        <span className="inline-block px-2 py-0.5 bg-green-100 text-green-600 rounded text-xs font-medium">
                                          Completed
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <div className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-[#2d5f3f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="font-medium">Total Journey</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-[#2d5f3f]">
                              {navigationState.isActive
                                ? (navigationState.distanceRemaining / 1000).toFixed(1)
                                : routeInfo.distance.toFixed(1)} km
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className="font-bold text-[#2d5f3f]">
                              {navigationState.isActive
                                ? Math.round(navigationState.timeRemaining / 60)
                                : Math.round(routeInfo.duration)} min
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
            </div>
          </div>
      )}

      {selectedGrave && (userLocation || customStartLocation) && routeLineRef.current && (
        <div className="fixed top-44 sm:top-32 left-1/2 -translate-x-1/2 z-[1100] pointer-events-none w-full px-2 sm:px-4">
          <div className="pointer-events-auto max-w-sm mx-auto">
            <div className="bg-white rounded-lg sm:rounded-xl shadow-lg p-2 sm:p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 text-left min-w-0">
                  <p className="text-xs text-gray-500 font-medium">
                    {navigationState.isActive ? "Navigating to" : "Navigation ready to"}
                  </p>
                  <p className="font-bold text-sm sm:text-base break-words">
                    {selectedGrave.grave_name}
                  </p>
                  {customStartLocation && (
                    <p className="text-xs text-red-600 font-medium mt-1">
                      From custom location
                    </p>
                  )}
                  {navigationState.isActive && (
                    <p className="text-xs text-green-600 font-medium mt-1 flex items-center gap-1">
                      <Navigation className="h-3 w-3 animate-pulse" />
                      Live tracking active
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setSelectedGrave(null)}
                  className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 p-1 rounded transition flex-shrink-0"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <button
                onClick={() => setIsRouteCardVisible(true)}
                className="w-full bg-[#2d5f3f] hover:bg-[#1e3f2a] text-white font-bold px-4 py-2 rounded-lg shadow text-sm transition-all"
              >
                {navigationState.isActive ? "View Live Progress" : "View Route"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CemeteryMap;
