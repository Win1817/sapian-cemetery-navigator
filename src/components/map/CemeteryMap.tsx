// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Leaflet marker fix
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
        case 'depart': return '📍'; 
        case 'arrive': return '🏁'; 
        case 'turn':
        case 'new':
        case 'continue':
            if (modifier?.includes('left')) return '↩️';
            if (modifier?.includes('right')) return '↪️';
            return '⬆️'; 
        default: return '➡️'; 
    }
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
  const [routeInfo, setRouteInfo] = useState<{distance: number, duration: number} | null>(null); 
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
  const [isRouteCardVisible, setIsRouteCardVisible] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // New: Flag to prevent repeated arrival announcements
  const hasArrivedRef = useRef(false);

  // --- THEME COLORS ---
  const PRIMARY_COLOR = "#2d5f3f"; 
  const ROUTE_LINE_COLOR = "#2d5f3f"; 
  const ENTRANCE_MARKER_COLOR = "#2d5f3f";
  const GRAVE_HIGHLIGHT_COLOR = "#a39f5a"; 
  // --------------------

  const cemeteryCentroid: [number, number] = [11.4945215, 122.6100805];
  const entranceLocation: [number, number] = [11.49508602798545, 122.60979891264897];
  
  const cemeteryBoundary: [number, number][] = [
    [11.495086199371954, 122.60979650734345],
    [11.493881585771362, 122.60982924452287],
    [11.494108374835463, 122.61020540340468],
    [11.495115965795222, 122.61001343784352],
    [11.495086199371954, 122.60979650734345]
  ];

  const walkingPathCoords: [number, number][] = [
    [11.49508602798545, 122.60979891264897],
    [11.494993454010569, 122.60980637678303],
    [11.495026, 122.609897],
    [11.494982, 122.60991],
    [11.4949, 122.60987],
    [11.494828635963241, 122.60990696966522],
    [11.494739, 122.609953],
    [11.494659, 122.609998],
    [11.494568, 122.609996],
    [11.494484, 122.610031],
    [11.494448790750877, 122.61003079843027],
    [11.494448583840741, 122.60999487814777],
    [11.494422125175433, 122.6099887234583],
    [11.494398, 122.610004],
    [11.494374918274039, 122.61003254998028],
    [11.494304, 122.610023],
    [11.4942605, 122.6100075],
    [11.494219498697582, 122.61000570311832],
    [11.49421583325424, 122.61007415304422],
    [11.494146915201455, 122.61006500930196],
    [11.494141624822081, 122.6099925718712],
    [11.49412, 122.609988],
    [11.494044, 122.610043],
    [11.493983, 122.60996],
    [11.494058, 122.60989],
    [11.494099624941262, 122.60990674215577],
    [11.494127248928669, 122.60986395311974],
    [11.494156501664854, 122.60988130627592],
    [11.494121, 122.609957],
    [11.494156583373037, 122.6099816094517],
    [11.494220832306823, 122.60998476249584],
    [11.494265999055624, 122.60993033746782],
    [11.494301751297765, 122.60993609376195],
    [11.49428579180368, 122.6099752859352],
    [11.49432058573131, 122.60998530782597],
    [11.494374332550331, 122.6099870672217],
    [11.494407582903316, 122.60995381247618],
    [11.494460250819765, 122.60995097500978],
    [11.494482, 122.609991],
    [11.494563416162599, 122.60995838124789],
    [11.494658500231173, 122.60995690933818],
    [11.494747, 122.609923],
    [11.494824, 122.609875],
    [11.49480883555459, 122.60984961565205],
    [11.494728333487402, 122.60989685935792],
    [11.494641084067752, 122.60991402654025],
    [11.494534, 122.609907],
    [11.494458334894436, 122.60991126404588],
    [11.494349834196468, 122.60990800310017],
    [11.49425, 122.609911],
    [11.494159, 122.609919],
    [11.494170289078305, 122.6098943898686],
    [11.494238748699145, 122.60988168597385],
    [11.494347082667055, 122.60988118752383],
    [11.494453, 122.609881],
    [11.494531332556939, 122.60987116718233],
    [11.494641583835653, 122.6098750703218],
    [11.494724, 122.609858],
    [11.494807, 122.609818],
    [11.4949, 122.609814],
    [11.494993663077258, 122.60980626326239]
  ]; // [lat, lng] format

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

  // --- Voice Instruction Logic ---
  const speakInstructions = (steps: RouteStep[], totalDuration: number) => {
    if (!('speechSynthesis' in window)) {
        toast({ title: "Voice Error", description: "Your browser doesn't support speech synthesis.", variant: "destructive" });
        return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(true);

    const stepsText = steps.map((step, index) => {
        const distanceStr = formatDistance(step.distance);
        
        // **FIX 2: Removed "You have arrived" here to allow dynamic detection to announce it later**
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
    utterance.onerror = (event) => {
        console.error('Speech synthesis error:', event);
        setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };
  
  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };
  // ------------------------------------

  // --- FIX 1: DYNAMIC ARRIVAL MONITORING ---
  useEffect(() => {
    // Only run if a grave is selected, we have location, and we haven't announced arrival yet
    if (!selectedGrave || !userLocation || hasArrivedRef.current) return;
    if (!selectedGrave.latitude || !selectedGrave.longitude) return;
    
    const graveLatLng = L.latLng(selectedGrave.latitude, selectedGrave.longitude);
    const userLatLng = L.latLng(userLocation[0], userLocation[1]);

    // Calculate the distance in meters
    const distanceToGrave = userLatLng.distanceTo(graveLatLng);

    const arrivalThreshold = 20; // Meters

    if (distanceToGrave <= arrivalThreshold) {
        // Prevent repeated announcements
        if (hasArrivedRef.current) return;

        // Stop any current navigation announcement
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        
        // Announce arrival
        const arrivalText = `You have arrived at the grave of ${selectedGrave.grave_name}.`;
        const utterance = new SpeechSynthesisUtterance(arrivalText);
        window.speechSynthesis.speak(utterance);
        
        toast({ title: "🎉 Destination Reached!", description: `You are within ${arrivalThreshold} meters of ${selectedGrave.grave_name}.`, variant: "default" });
        
        hasArrivedRef.current = true; // Set flag to true
        setIsSpeaking(false);
    } else {
        // If they move away significantly, reset the flag (in case they leave and come back)
        if (distanceToGrave > 50 && hasArrivedRef.current) {
             hasArrivedRef.current = false;
        }
    }
    
// Dependency array must include userLocation for dynamic checking
}, [userLocation, selectedGrave, toast]);
// ------------------------------------------

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const tileLayers = {
      OpenStreetMap: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 20,
      }),
      // --- CARTO LAYER ADDITION ---
      CartoPositron: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png", { 
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>',
        maxZoom: 20,
        subdomains: 'abcd',
      }),
      // ----------------------------
      Satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles Esri", maxZoom: 19 }
      ),
    };

    mapRef.current = L.map(mapContainerRef.current, {
      center: cemeteryCentroid,
      zoom: 18,
      layers: [tileLayers.CartoPositron], // Use Carto as default layer
      zoomControl: true,
      tap: true,
      tapTolerance: 30,
    });

    setTimeout(() => mapRef.current?.invalidateSize(), 100);

    // Initialize layers
    staticMarkersRef.current = L.layerGroup().addTo(mapRef.current);
    gravesLayerRef.current = L.layerGroup().addTo(mapRef.current);
    dynamicLayerRef.current = L.layerGroup().addTo(mapRef.current);

    L.control.layers(
      { 
        "OpenStreetMap": tileLayers.OpenStreetMap, 
        "Carto Positron": tileLayers.CartoPositron, // Layer control addition
        "Satellite": tileLayers.Satellite 
      },
      {},
      { position: "topright" }
    ).addTo(mapRef.current);

    L.polygon(cemeteryBoundary, {
      color: PRIMARY_COLOR, 
      weight: 3,
      fillColor: PRIMARY_COLOR,
      fillOpacity: 0.15,
    }).addTo(mapRef.current);

    // Walking path lines
    L.polyline(walkingPathCoords, { color: GRAVE_HIGHLIGHT_COLOR, weight: 8, opacity: 0.75 }).addTo(staticMarkersRef.current!);
    L.polyline(walkingPathCoords, { color: "#ffffff", weight: 4, opacity: 0.9 }).addTo(staticMarkersRef.current!);

    // Entrance Marker
    const entranceIcon = L.divIcon({
      html: `
        <div style="
          background: ${ENTRANCE_MARKER_COLOR};
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 13px;
          font-family: system-ui, sans-serif;
          box-shadow: 0 4px 16px ${ENTRANCE_MARKER_COLOR}80;
          border: 3px solid white;
        ">ENT</div>
      `,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });
    L.marker(entranceLocation, { icon: entranceIcon, zIndexOffset: 1000 })
      .addTo(staticMarkersRef.current!);
  }, []);

  // Cleanup for speech synthesis on component unmount
  useEffect(() => {
    return () => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    };
  }, []);

  // Re-invalidate size on resize (critical for mobile)
  useEffect(() => {
    const handleResize = () => {
      mapRef.current?.invalidateSize();
    };
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

  useEffect(() => {
    if (!mapRef.current || !gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers(); 

    graves.forEach((grave) => {
      if (!grave.latitude || !grave.longitude) return;

      const lat = grave.latitude;
      const lng = grave.longitude;

      // Create the Rectangle (The "Grave Box")
      const rect = L.rectangle(
        [[lat - 0.0000125, lng - 0.000025], [lat + 0.0000125, lng + 0.000025]],
        { color: "#d9d9d9", weight: 1, fillColor: "#f5f5f5", fillOpacity: 1 }
      );

      rect.on("mouseover", () => rect.setStyle({ fillColor: "#e0e0e0", weight: 2 }));
      rect.on("mouseout", () => rect.setStyle({ fillColor: "#f5f5f5", weight: 1 }));

      // Create the Label Marker
      const labelText = grave.lot_number || grave.grave_name.split(" ").map(w => w[0]).join("").toUpperCase();
      const labelIcon = L.divIcon({
        html: `<div style="font-size:10px;font-weight:bold;color:#4b5563;text-align:center;">${labelText}</div>`,
        iconSize: [30, 14],
        iconAnchor: [15, 7],
      });

      const marker = L.marker([lat, lng], { icon: labelIcon });
      const popupContent = getRichPopupContent(grave);

      // Bind Popups and Click Handlers
      rect.bindPopup(popupContent, { 
        maxWidth: 360, 
        className: "custom-grave-popup",
        maxWidth: window.innerWidth < 480 ? 300 : 360
      });
      marker.bindPopup(popupContent, { 
        maxWidth: 360, 
        className: "custom-grave-popup",
        maxWidth: window.innerWidth < 480 ? 300 : 360
      });

      rect.on("click", () => setSelectedGrave(grave));
      marker.on("click", () => setSelectedGrave(grave));

      // Add to Layer
      rect.addTo(layer);
      marker.addTo(layer);
    });
  }, [graves, setSelectedGrave]);
  
  const handleGetDirections = () => {
    if (routeInfo && routeSteps.length > 0) {
        setIsRouteCardVisible(true);
        // TRIGGER VOICE INSTRUCTIONS
        speakInstructions(routeSteps, routeInfo.duration);
        hasArrivedRef.current = false; // Reset arrival flag when starting a new route
    } else if (routeSteps.length === 0) {
        toast({ title: "Directions Not Ready", description: "Please wait for the route to load before viewing details.", variant: "default" });
    }
  };

  useEffect(() => {
    if (!mapRef.current || !dynamicLayerRef.current || !selectedGrave || !userLocation) {
        dynamicLayerRef.current?.clearLayers();
        routeLineRef.current?.remove();
        setRouteInfo(null);
        setRouteSteps([]); 
        setIsRouteCardVisible(false); 
        stopSpeaking(); 
        hasArrivedRef.current = false; // Reset arrival flag
        return;
    }

    const layer = dynamicLayerRef.current;
    layer.clearLayers();
    routeLineRef.current?.remove();

    const graveLatLng = L.latLng(selectedGrave.latitude!, selectedGrave.longitude!);
    const closestOnPath = getClosestPointOnPath(graveLatLng);

    const pulsingIcon = L.divIcon({
      html: `
        <div style="
          width:38px;height:38px;border-radius:50%;
          background:${GRAVE_HIGHLIGHT_COLOR};
          border:5px solid white;
          box-shadow:0 0 30px ${GRAVE_HIGHLIGHT_COLOR}80;
          animation:pulse 2s infinite;">
        </div>`,
      className: "pulsing-marker",
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    L.marker(graveLatLng, { icon: pulsingIcon, zIndexOffset: 3000 })
      .addTo(layer)
      .bindPopup(getRichPopupContent(selectedGrave), {
        maxWidth: window.innerWidth < 480 ? 300 : 380,
        className: "custom-grave-popup",
      })
      .openPopup();

    mapRef.current.setView(graveLatLng, 19);

    const start = `${userLocation[1]},${userLocation[0]}`;
    const entrance = `${entranceLocation[1]},${entranceLocation[0]}`;

    fetch(`https://router.project-osrm.org/route/v1/walking/${start};${entrance}?overview=full&geometries=geojson&steps=true`)
      .then(r => r.json())
      .then(data => {
        let fullRoute: [number, number][] = [];
        const route = data.routes?.[0];
        
        if (route?.geometry?.coordinates) {
          fullRoute = route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
          
          setRouteInfo({
            distance: route.distance, 
            duration: route.duration,
          });

          const steps: RouteStep[] = [];
          if (route.legs && route.legs.length > 0) {
              route.legs[0].steps.forEach((step: any) => {
                  if (step.maneuver && typeof step.maneuver.instruction === 'string' && step.maneuver.instruction.trim() !== '') {
                      steps.push({
                          instruction: step.maneuver.instruction,
                          distance: step.distance,
                          duration: step.duration,
                      });
                  }
              });
          }
          
          steps.push({
              instruction: `Continue into the cemetery grounds and proceed towards the grave of ${selectedGrave.grave_name}.`,
              distance: 0, 
              duration: 0,
          });
          
          setRouteSteps(steps);
        } else {
          fullRoute.push(userLocation);
          setRouteInfo(null);
          setRouteSteps([]);
        }

        const closestIndex = walkingPathCoords.findIndex(p =>
          Math.abs(p[0] - closestOnPath.lat) < 0.00002 && Math.abs(p[1] - closestOnPath.lng) < 0.00002
        );

        const internalPath = closestIndex >= 0
          ? walkingPathCoords.slice(0, closestIndex + 1)
          : walkingPathCoords.slice(0, 15);

        internalPath.push([graveLatLng.lat, graveLatLng.lng]);
        fullRoute.push(...internalPath.slice(1));

        routeLineRef.current = L.polyline(fullRoute, {
          color: ROUTE_LINE_COLOR, 
          weight: 8,
          opacity: 0.95,
        }).addTo(layer);
      })
      .catch((error) => {
        console.error("OSRM Routing Error:", error);
        const fallback = [userLocation, entranceLocation, [graveLatLng.lat, graveLatLng.lng]];
        routeLineRef.current = L.polyline(fallback, {
          color: ROUTE_LINE_COLOR, 
          weight: 8,
          opacity: 0.95,
        }).addTo(layer);
        setRouteInfo(null);
        setRouteSteps([]);
        toast({ title: "Routing Error", description: "Could not fetch turn-by-turn directions.", variant: "destructive" });
      });
  }, [selectedGrave, userLocation]);

  return (
    <div className="w-full h-screen md:h-full relative">
      <div 
        ref={mapContainerRef} 
        className="w-full h-full rounded-lg"
        style={{ minHeight: "100vh" }}
      />

      {/* 🧭 Directions Summary Card (Top Right) */}
      {isRouteCardVisible && selectedGrave && routeInfo && (
        <div 
            className="absolute top-4 right-4 z-[9999] bg-white rounded-xl shadow-2xl p-4 max-w-xs w-[90%] md:w-80 overflow-y-auto"
            style={{ 
                maxHeight: '90vh', 
                animation: 'fade-in 0.3s forwards',
            }}
        >
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="font-bold text-lg text-gray-800 truncate">
                    Route to {selectedGrave.grave_name}
                </h3>
                <button
                    onClick={() => {
                        setIsRouteCardVisible(false);
                        stopSpeaking(); // Stop speaking when closing the card
                    }}
                    className="text-gray-400 hover:text-gray-600 font-semibold text-xl ml-2"
                >
                    &times;
                </button>
            </div>
            
            <div className="mb-4">
                <p className="text-xl font-extrabold" style={{ color: PRIMARY_COLOR }}>
                    {formatDuration(routeInfo.duration)}
                </p>
                <p className="text-sm text-gray-500">
                    Total walking distance: {formatDistance(routeInfo.distance)}
                </p>
            </div>
            
            {/* --- VOICE CONTROLS --- */}
            <div className="mb-4">
                <button
                    onClick={isSpeaking ? stopSpeaking : () => speakInstructions(routeSteps, routeInfo.duration)}
                    style={{ 
                        backgroundColor: isSpeaking ? '#ef4444' : PRIMARY_COLOR, 
                        transition: 'background-color 0.2s'
                    }}
                    className="w-full text-white font-bold py-2 px-4 rounded-lg shadow-md flex items-center justify-center text-sm"
                    disabled={routeSteps.length === 0}
                >
                    <span className="mr-2">{isSpeaking ? '🛑' : '🔊'}</span>
                    {isSpeaking ? 'Stop Voice Guidance' : 'Start Voice Guidance'}
                </button>
            </div>
            {/* ------------------------ */}

            {/* --- DETAILED STEPS LIST --- */}
            <div className="space-y-3">
                <h4 className="font-bold text-sm text-gray-700 uppercase tracking-wider">Turn-by-Turn Steps</h4>
                {routeSteps.length > 0 ? (
                    routeSteps.map((step, index) => (
                        <div key={index} className="flex items-start space-x-3">
                            <div className="flex-shrink-0 mt-0.5 text-lg">
                                {index === routeSteps.length - 1 
                                    ? '🏁'
                                    : step.instruction
                                        ? getManeuverIcon(step.instruction.split(' ')[0].toLowerCase(), step.instruction.toLowerCase())
                                        : '➡️'
                                }
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 leading-snug">
                                    {step.instruction}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    {formatDistance(step.distance)}
                                    {index < routeSteps.length - 1 && 
                                        ` • ${formatDuration(step.duration)}`
                                    }
                                </p>
                            </div>
                        </div>
                    ))
                ) : (
                    <p className="text-sm text-gray-500">Directions steps loading or not available for this route.</p>
                )}
            </div>
            {/* --------------------------- */}
        </div>
      )}
      {/* ------------------------------------------- */}

      {/* --- Route Trigger Card (Bottom Center) --- */}
      {selectedGrave && userLocation && routeInfo && (
        <div 
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-white rounded-xl shadow-2xl p-3 flex items-center space-x-4 max-w-sm w-[90%] sm:w-80"
          style={{ 
              transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
              animation: 'slide-up 0.3s forwards',
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 truncate">Route calculated for</p>
            <p className="font-semibold text-gray-800 truncate">{selectedGrave.grave_name}</p>
          </div>
          <button
            onClick={handleGetDirections}
            className="flex-shrink-0 text-white font-bold py-2 px-4 rounded-lg transition duration-150 shadow-md"
            style={{ backgroundColor: PRIMARY_COLOR, transition: 'background-color 0.2s' }}
          >
            Route Details
          </button>
        </div>
      )}
      {/* ------------------------------------------- */}

      
      {/* Mobile-Optimized Styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 ${GRAVE_HIGHLIGHT_COLOR}80; }
          70% { transform: scale(1.15); box-shadow: 0 0 0 18px ${GRAVE_HIGHLIGHT_COLOR}00; }
        }
        .pulsing-marker > div { animation: pulse 2s infinite; }
        
        @keyframes slide-up {
            from { transform: translate(-50%, 100px); opacity: 0; }
            to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes fade-in {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @media (max-width: 480px) {
          .leaflet-popup-content-wrapper {
            border-radius: 12px !important;
            padding: 8px !important;
          }
          .leaflet-popup-content {
            margin: 8px !important;
            font-size: 14px !important;
          }
        }

        .custom-grave-popup .leaflet-popup-content-wrapper {
          border-radius: 16px !important;
          box-shadow: 0 10px 40px rgba(0,0,0,0.22) !important;
        }
        .custom-grave-popup .leaflet-popup-content { 
          margin: 0 !important; 
          padding: 16px; 
        }
        .custom-grave-popup .leaflet-popup-tip { 
          background: white !important; 
        }
      `}</style>
    </div>
  );
};

export default CemeteryMap;
