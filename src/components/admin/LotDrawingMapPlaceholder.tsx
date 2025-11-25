// src/components/admin/LotDrawingMapPlaceholder.tsx
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { MapPin, X, Save, Layers, MousePointerClick, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MAP_CONFIG } from "../map/mapConfig";

// Leaflet imports
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw"; // must come after Leaflet

interface LotDrawingMapProps {
  onCancel: () => void;
  onSave: (lotData: {
    polygon_coordinates: [number, number][];
    centroid_lat: number;
    centroid_lng: number;
    block: string;
    lot: string;
  }) => void;
  isSaving?: boolean;
}

export const LotDrawingMap = ({ onCancel, onSave, isSaving = false }: LotDrawingMapProps) => {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const [block, setBlock] = useState("");
  const [lot, setLot] = useState("");
  const [tempCoords, setTempCoords] = useState<[number, number][] | null>(null);
  const [tempCentroid, setTempCentroid] = useState<{ lat: number; lng: number } | null>(null);

  const calculateCentroid = (coords: [number, number][]) => {
    const N = coords.length;
    if (N === 0) return { lat: 0, lng: 0 };
    const latSum = coords.reduce((sum, [lat]) => sum + lat, 0);
    const lngSum = coords.reduce((sum, [, lng]) => sum + lng, 0);
    return { lat: latSum / N, lng: lngSum / N };
  };

  const handleSaveClick = () => {
    if (!block.trim() || !lot.trim()) {
      toast({ title: "Missing Details", description: "Please enter both Block Number and Lot Number.", variant: "destructive" });
      return;
    }
    if (!tempCoords || !tempCentroid) {
      toast({ title: "No Shape Drawn", description: "Please draw the lot polygon on the map first.", variant: "destructive" });
      return;
    }

    onSave({
      polygon_coordinates: tempCoords,
      centroid_lat: tempCentroid.lat,
      centroid_lng: tempCentroid.lng,
      block,
      lot,
    });
  };

  useEffect(() => {
    if (!mapContainerRef.current || mapInstance) return;

    let map: L.Map;
    let drawnItems: L.FeatureGroup;

    try {
      // Tile Layers
      const satellite = L.tileLayer(MAP_CONFIG.TILES.SATELLITE.url, {
        maxZoom: MAP_CONFIG.TILES.SATELLITE.maxZoom,
        attribution: MAP_CONFIG.TILES.SATELLITE.attribution,
      });
      const cartoLight = L.tileLayer(MAP_CONFIG.TILES.CARTO_POSITRON.url, {
        maxZoom: MAP_CONFIG.TILES.CARTO_POSITRON.maxZoom,
        attribution: MAP_CONFIG.TILES.CARTO_POSITRON.attribution,
      });
      const osmLayer = L.tileLayer(MAP_CONFIG.TILES.OSM_STANDARD.url, {
        maxZoom: MAP_CONFIG.TILES.OSM_STANDARD.maxZoom,
        attribution: MAP_CONFIG.TILES.OSM_STANDARD.attribution,
      });

      // Initialize Map
      map = L.map(mapContainerRef.current, {
        center: MAP_CONFIG.CENTER,
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
        layers: [satellite],
      });

      // Layer Control
      const baseMaps = {
        Satellite: satellite,
        "Clean Map": cartoLight,
        "Street Map": osmLayer,
      };
      L.control.layers(baseMaps).addTo(map);

      // Cemetery Boundary
      if (MAP_CONFIG.cemeteryBoundary && MAP_CONFIG.cemeteryBoundary.length > 0) {
        L.polygon(MAP_CONFIG.cemeteryBoundary, {
          color: "#ef4444",
          weight: 2,
          dashArray: "5,10",
          fillColor: MAP_CONFIG.COLORS.PRIMARY,
          fillOpacity: 0.05,
          interactive: false,
        }).addTo(map);
      }

      // Draw Control
      drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: false, // disabled to avoid 'type is not defined' error
            shapeOptions: { color: "#10b981", weight: 3 },
            drawError: { color: "#e03e3e", timeout: 2000 },
            repeatMode: false,
          },
          rectangle: {
            shapeOptions: { color: "#10b981", weight: 3 },
          },
          circle: false,
          marker: false,
          circlemarker: false,
          polyline: false,
        },
      });

      map.addControl(drawControl);

      // Draw Events
      map.on(L.Draw.Event.CREATED, (e: any) => {
        drawnItems.clearLayers(); // keep only latest shape
        const layer = e.layer;
        drawnItems.addLayer(layer);

        let coords: [number, number][] = [];
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
          const latLngs = (layer as L.Polygon).getLatLngs()[0];
          coords = latLngs.map((ll: any) => [ll.lat, ll.lng]);
        }

        const centroid = calculateCentroid(coords);
        setTempCoords(coords);
        setTempCentroid(centroid);

        toast({ title: "Boundary Set", description: "Enter Block & Lot details to continue." });
      });

      map.on(L.Draw.Event.DELETED, () => {
        setTempCoords(null);
        setTempCentroid(null);
      });

      map.whenReady(() => setIsMapReady(true));
      setMapInstance(map);
    } catch (error) {
      console.error("Error initializing map:", error);
      toast({ title: "Map Initialization Error", description: "There was a problem loading the map.", variant: "destructive" });
    }

    return () => {
      if (map) map.remove();
      setMapInstance(null);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-6xl mx-4 shadow-2xl border-0 overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <CardHeader className="bg-white border-b px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-6 h-6 text-primary" />
                Add New Lot
              </CardTitle>
              <CardDescription className="font-sans">Create a spatial lot container.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onCancel} className="hover:text-red-600" disabled={isSaving}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Sidebar */}
          <div className="w-full md:w-80 bg-slate-50 border-r p-6 flex flex-col gap-6 shrink-0 overflow-y-auto font-sans">
            <div className="space-y-5">
              <div className="p-3 bg-white rounded-lg border shadow-sm">
                <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Location ID
                </h3>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="block">Block / Section</Label>
                    <Input id="block" placeholder="e.g. Block A" value={block} onChange={(e) => setBlock(e.target.value)} className="bg-white" disabled={isSaving} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="lot">Lot Number</Label>
                    <Input id="lot" placeholder="e.g. Lot 105" value={lot} onChange={(e) => setLot(e.target.value)} className="bg-white" disabled={isSaving} />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-md border border-blue-100 text-sm text-blue-800">
                <p className="font-bold mb-2 flex items-center gap-2">
                  <MousePointerClick className="w-4 h-4" /> Instructions:
                </p>
                <ul className="list-disc pl-4 space-y-1 leading-relaxed">
                  <li>Use the polygon or rectangle tool (top right) to trace the lot.</li>
                  <li>The <span className="text-red-600 font-bold">-- red dashed --</span> line is the cemetery boundary.</li>
                </ul>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <Button className="w-full font-semibold shadow-md" size="lg" onClick={handleSaveClick} disabled={!tempCoords || isSaving}>
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" /> Save Lot
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Map Area */}
          <CardContent className="flex-1 p-0 relative bg-slate-200">
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />
            {!isMapReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <p className="animate-pulse font-medium text-gray-500">Initializing Satellite Map...</p>
              </div>
            )}
          </CardContent>
        </div>
      </Card>
    </div>
  );
};
