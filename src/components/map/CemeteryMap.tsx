// src/components/map/CemeteryMap.tsx
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-routing-machine";
import "leaflet-routing-machine/dist/leaflet-routing-machine.css";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
// Fix default marker icons
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
          width:36px;height:36px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          border:4px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          font-weight:bold;
          font-size:14px;
        ">ENTRANCE</div>`,
      className: "custom-entrance",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
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
  // Render graves safely
  useEffect(() => {
    if (!mapRef.current || !gravesLayerRef.current) return;
    const layer = gravesLayerRef.current;
    layer.clearLayers();
    graves.forEach((grave) => {
      // Skip graves without valid coordinates
      if (grave.latitude === null || grave.longitude === null) return;
      const boxSizeLat = 0.0000125;
      const boxSizeLng = 0.000025;
      const rect = L.rectangle(
        [
          [grave.latitude - boxSizeLat, grave.longitude - boxSizeLng],
          [grave.latitude + boxSizeLat, grave.longitude + boxSizeLng],
        ],
        {
          color: "#d9d9d9",
          weight: 1,
          fillColor: "#f5f5f5",
          fillOpacity: 1,
        }
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
          font-size: 10px;
          font-weight: bold;
          color: #4b5563;
          text-align: center;
          line-height: 12px;
          width: 24px;
          height: 12px;
        ">${labelText}</div>`,
        className: "grave-label",
        iconSize: [24, 12],
        iconAnchor: [12, 6],
      });
      const marker = L.marker([grave.latitude, grave.longitude], { icon: labelIcon });
      // Calculate years since death
      let yearsSinceDeath = "";
      if (grave.date_of_death) {
        const deathYear = new Date(grave.date_of_death).getFullYear();
        const currentYear = new Date().getFullYear();
        yearsSinceDeath = ` (${currentYear - deathYear} yrs ago)`;
      }
      const popup = `
        <div style="max-width:200px;font-family:sans-serif">
          <h3 style="margin:0 0 4px;font-size:14px;font-weight:600;">${grave.grave_name}</h3>
          ${
            grave.grave_image_url
              ? `<img src="${grave.grave_image_url}" style="width:100%;height:90px;object-fit:cover;border-radius:4px;margin:4px 0;" />`
              : ""
          }
          ${
            grave.date_of_birth || grave.date_of_death
              ? `<p style="margin:2px 0;font-size:11px;color:#6b7280;">
                  ${grave.date_of_birth || "-"} – ${grave.date_of_death || "-"}${yearsSinceDeath}
                </p>`
              : ""
          }
          ${grave.additional_info ? `<p style="margin:2px 0;font-size:11px;">${grave.additional_info}</p>` : ""}
        </div>
      `;
      rect.bindPopup(popup).addTo(layer);
      marker.bindPopup(popup).addTo(layer);
    });
  }, [graves]);
  // Selected grave routing
  useEffect(() => {
    if (!mapRef.current || !selectedGrave || !dynamicLayerRef.current) return;
    if (selectedGrave.latitude === null || selectedGrave.longitude === null) return;
    const layer = dynamicLayerRef.current;
    layer.clearLayers();
    const graveIcon = L.divIcon({
      html: `<div style="
        background:#2563eb;
        color:white;
        width:28px;height:28px;
        border-radius:50%;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        font-weight:bold;
        box-shadow:0 1px 6px rgba(0,0,0,0.4);
      ">📍</div>`,
      className: "selected-grave-icon",
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
    const marker = L.marker([selectedGrave.latitude, selectedGrave.longitude], { icon: graveIcon });
    // Calculate years since death
    let yearsSinceDeath = "";
    if (selectedGrave.date_of_death) {
      const deathYear = new Date(selectedGrave.date_of_death).getFullYear();
      const currentYear = new Date().getFullYear();
      yearsSinceDeath = ` (${currentYear - deathYear} yrs ago)`;
    }
    const popup = `
      <div style="max-width:200px;font-family:sans-serif">
        <h3 style="margin:0 0 4px;font-size:14px;font-weight:600;">${selectedGrave.grave_name}</h3>
        ${
          selectedGrave.grave_image_url
            ? `<img src="${selectedGrave.grave_image_url}" style="width:100%;height:90px;object-fit:cover;border-radius:4px;margin:4px 0;" />`
            : ""
        }
        ${
          selectedGrave.date_of_birth || selectedGrave.date_of_death
            ? `<p style="margin:2px 0;font-size:11px;color:#6b7280;">
                ${selectedGrave.date_of_birth || "-"} – ${selectedGrave.date_of_death || "-"}${yearsSinceDeath}
              </p>`
            : ""
        }
        ${selectedGrave.additional_info ? `<p style="margin:2px 0;font-size:11px;">${selectedGrave.additional_info}</p>` : ""}
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
  return <div ref={mapContainerRef} className="w-full h-full rounded-lg" />;
};
export default CemeteryMap;
