// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Fix default Leaflet marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
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

interface CemeteryMapProps {
  selectedGrave: Grave | null;
  setSelectedGrave: (grave: Grave | null) => void;
  userLocation: [number, number] | null;
}

const CemeteryMap = ({ selectedGrave, setSelectedGrave, userLocation }: CemeteryMapProps) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const gravesLayerRef = useRef<L.LayerGroup | null>(null);
  const dynamicLayerRef = useRef<L.LayerGroup | null>(null);
  const staticMarkersRef = useRef<L.LayerGroup | null>(null);
  const routingControlRef = useRef<any>(null);
  const { toast } = useToast();
  const [graves, setGraves] = useState<Grave[]>([]);

  const cemeteryCentroid: [number, number] = [11.4945215, 122.6100805];
  const entranceLocation: [number, number] = [11.49511, 122.60992];

  const boundaryGeoJSON = {
    coordinates: [
      [
        [122.609914284139, 11.49510787653692],
        [122.60991927582035, 11.493924117441324],
        [122.61024706285639, 11.494114888870982],
        [122.61002909279688, 11.495119290167167],
        [122.609914284139, 11.49510787653692],
      ],
    ],
  };
  const cemeteryBoundary: [number, number][] = boundaryGeoJSON.coordinates[0].map(
    ([lng, lat]) => [lat, lng]
  );

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const tileLayers = {
      OpenStreetMap: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 20,
      }),
      Satellite: L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Tiles © Esri", maxZoom: 19 }
      ),
    };

    mapRef.current = L.map(mapContainerRef.current, {
      center: cemeteryCentroid,
      zoom: 18,
      layers: [tileLayers.OpenStreetMap],
    });

    staticMarkersRef.current = L.layerGroup().addTo(mapRef.current);
    gravesLayerRef.current = L.layerGroup().addTo(mapRef.current);
    dynamicLayerRef.current = L.layerGroup().addTo(mapRef.current);

    L.control.layers(
      { "Street Map": tileLayers.OpenStreetMap, Satellite: tileLayers.Satellite },
      {},
      { position: "topright" }
    ).addTo(mapRef.current);

    // Cemetery boundary
    L.polygon(cemeteryBoundary, {
      color: "#2d5f3f",
      weight: 3,
      fillColor: "#5D866C",
      fillOpacity: 0.15,
    }).addTo(mapRef.current);

    // Entrance marker
    const entranceIcon = L.divIcon({
      html: `<div style="
          background:#2563eb;
          color:white;
          width:28px;
          height:28px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          border:3px solid white;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
          font-weight:bold;
          font-size:10px;
          text-align:center;
        ">ENT</div>`,
      className: "custom-entrance",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker(entranceLocation, { icon: entranceIcon })
      .addTo(staticMarkersRef.current)
      .bindPopup("<strong>Main Entrance</strong>");
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

  // Helper: calculate age accurately
  const calculateAge = (dob: string, dod?: string) => {
    const birth = new Date(dob);
    const end = dod ? new Date(dod) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const m = end.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
    return age;
  };

  // Helper: format date
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  // Render graves
  useEffect(() => {
    if (!mapRef.current || !gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers();

    graves.forEach((grave) => {
      if (grave.latitude === null || grave.longitude === null) return;

      const rect = L.rectangle(
        [
          [grave.latitude - 0.0000125, grave.longitude - 0.000025],
          [grave.latitude + 0.0000125, grave.longitude + 0.000025],
        ],
        { color: "#d9d9d9", weight: 1, fillColor: "#f5f5f5", fillOpacity: 1 }
      );

      rect.on("mouseover", function () {
        this.setStyle({ fillColor: "#e0e0e0", weight: 2 });
      });
      rect.on("mouseout", function () {
        this.setStyle({ fillColor: "#f5f5f5", weight: 1 });
      });

      const labelText = grave.lot_number
        ? grave.lot_number
        : grave.grave_name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .toUpperCase();

      const labelIcon = L.divIcon({
        html: `<div style="
          font-size:10px;
          font-weight:bold;
          color:#4b5563;
          text-align:center;
          line-height:12px;
          width:24px;
          height:12px;
        ">${labelText}</div>`,
        className: "grave-label",
        iconSize: [24, 12],
        iconAnchor: [12, 6],
      });

      const marker = L.marker([grave.latitude, grave.longitude], { icon: labelIcon });

      const age = grave.date_of_birth ? calculateAge(grave.date_of_birth, grave.date_of_death) : "-";

      const popup = `
        <div style="
          max-width:200px;
          font-family:sans-serif;
          background:#fefefe;
          padding:8px;
          border-radius:8px;
          box-shadow:0 2px 6px rgba(0,0,0,0.15);
          text-align:left;
        ">
          ${grave.grave_image_url ? `<img src="${grave.grave_image_url}" onerror="this.style.display='none'" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />` : ""}
          <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${grave.grave_name}</div>
          <div style="font-size:12px;margin-bottom:2px;">Age ${age}</div>
          ${grave.date_of_birth ? `<div style="font-size:12px;margin-bottom:2px;">Born: ${formatDate(grave.date_of_birth)}</div>` : ""}
          ${grave.date_of_death ? `<div style="font-size:12px;">Died: ${formatDate(grave.date_of_death)}</div>` : ""}
        </div>
      `;

      rect.bindPopup(popup);
      marker.bindPopup(popup);

      rect.on("click", () => setSelectedGrave(grave));
      marker.on("click", () => setSelectedGrave(grave));

      rect.addTo(layer);
      marker.addTo(layer);
    });
  }, [graves, setSelectedGrave]);

  // Selected grave marker & routing
  useEffect(() => {
    if (!mapRef.current || !selectedGrave || !dynamicLayerRef.current) return;
    if (selectedGrave.latitude === null || selectedGrave.longitude === null) return;

    const layer = dynamicLayerRef.current;
    layer.clearLayers();

    const pulsingIcon = L.divIcon({
      html: `<div style="
        width:24px;
        height:24px;
        border-radius:50%;
        background:red;
        animation:pulse 1.5s infinite;
        border:2px solid white;
      "></div>`,
      className: "pulsing-grave",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });

    const marker = L.marker([selectedGrave.latitude, selectedGrave.longitude], { icon: pulsingIcon });

    const age = selectedGrave.date_of_birth ? calculateAge(selectedGrave.date_of_birth, selectedGrave.date_of_death) : "-";

    const popup = `
      <div style="
        max-width:200px;
        font-family:sans-serif;
        background:#fefefe;
        padding:8px;
        border-radius:8px;
        box-shadow:0 2px 6px rgba(0,0,0,0.15);
        text-align:left;
      ">
        ${selectedGrave.grave_image_url ? `<img src="${selectedGrave.grave_image_url}" onerror="this.style.display='none'" style="width:100%;height:100px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />` : ""}  
        <div style="font-weight:600;font-size:14px;margin-bottom:4px;">${selectedGrave.grave_name}</div>
        <div style="font-size:12px;margin-bottom:2px;">Age ${age}</div>
        ${selectedGrave.date_of_birth ? `<div style="font-size:12px;margin-bottom:2px;">Born: ${formatDate(selectedGrave.date_of_birth)}</div>` : ""}
        ${selectedGrave.date_of_death ? `<div style="font-size:12px;">Died: ${formatDate(selectedGrave.date_of_death)}</div>` : ""}
      </div>
    `;

    marker.bindPopup(popup).addTo(layer).openPopup();

    mapRef.current.setView([selectedGrave.latitude, selectedGrave.longitude], 19);

    if (userLocation) {
      if (routingControlRef.current) {
        mapRef.current.removeControl(routingControlRef.current);
      }
      routingControlRef.current = L.Routing.control({
        waypoints: [
          L.latLng(userLocation[0], userLocation[1]),
          L.latLng(selectedGrave.latitude, selectedGrave.longitude),
        ],
        lineOptions: { styles: [{ color: "#2563eb", weight: 4 }] },
        show: false,
        addWaypoints: false,
        routeWhileDragging: false,
        fitSelectedRoutes: true,
        createMarker: () => null,
      }).addTo(mapRef.current);
    }
  }, [selectedGrave, userLocation]);

  return (
    <>
      <div ref={mapContainerRef} className="w-full h-full rounded-lg" />
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.8); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.3; }
          100% { transform: scale(0.8); opacity: 0.6; }
        }
      `}</style>
    </>
  );
};

export default CemeteryMap;
