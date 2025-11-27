import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { MapPin, X, Save, Layers, MousePointerClick, Loader2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { MAP_CONFIG } from "../map/mapConfig";

// Leaflet imports
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw"; // must come after Leaflet

// --- CONSTANTS ---
const PATH_PRIMARY_COLOR = "#a39f5a";
const PATH_CENTER_COLOR = "#ffffff";

const walkingPathCoords: [number, number][] = [
  [11.495096158301706, 122.60987221867981],
  [11.494968327920532, 122.60987876789699],
  [11.494979753688696, 122.60996397403119],
  [11.494141414948984, 122.61009393851407],
  [11.494028746061815, 122.60991432451885],
  [11.49496748331353, 122.60987887470753],
];

const entranceLocation: [number, number] = walkingPathCoords[0];

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
  editingLot?: {
    id: string;
    lot_number: string;
    block_name: string;
    display_name: string;
    is_available: boolean;
    centroid_lat: number;
    centroid_lng: number;
    created_at: string;
  } | null;
}

interface Polygon {
  id: string;
  coordinates: [number, number][];
  is_available: boolean;
  block_name: string;
  lot_number: string;
}

export const LotDrawingMap = ({ onCancel, onSave, isSaving = false, editingLot = null }: LotDrawingMapProps) => {
  const { toast } = useToast();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polygonsLayerRef = useRef<L.LayerGroup | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [existingPolygons, setExistingPolygons] = useState<Polygon[]>([]);
  const [loadingPolygons, setLoadingPolygons] = useState(true);
  const pathsLayerRef = useRef<L.LayerGroup | null>(null);

  const [block, setBlock] = useState(editingLot?.block_name || "");
  const [lot, setLot] = useState(editingLot?.lot_number || "");
  const [tempCoords, setTempCoords] = useState<[number, number][] | null>(null);
  const [tempCentroid, setTempCentroid] = useState<{ lat: number; lng: number } | null>(null);
  const [editingPolygonId, setEditingPolygonId] = useState<string | null>(editingLot?.id || null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);

  const calculateCentroid = (coords: [number, number][]) => {
    const N = coords.length;
    if (N === 0) return { lat: 0, lng: 0 };
    const latSum = coords.reduce((sum, [lat]) => sum + lat, 0);
    const lngSum = coords.reduce((sum, [, lng]) => sum + lng, 0);
    return { lat: latSum / N, lng: lngSum / N };
  };

  const fetchExistingPolygons = async () => {
    setLoadingPolygons(true);
    try {
      // Use any to bypass type checking since lots table isn't in types
      const { data, error } = await (supabase.from("lots") as any)
        .select("polygon_id, is_available, lot_number, block_id(block_name), polygon_id(*)")
        .returns<any[]>();

      if (error) throw error;

      const polygons: Polygon[] = (data || [])
        .filter((lot: any) => lot.polygon_id)
        .map((lot: any) => ({
          id: lot.polygon_id.id,
          coordinates: lot.polygon_id.coordinates,
          is_available: lot.is_available,
          block_name: lot.block_id?.block_name || "Unknown",
          lot_number: lot.lot_number || "Unknown",
        }));

      setExistingPolygons(polygons);
    } catch (err: any) {
    } finally {
      setLoadingPolygons(false);
    }
  };

  // Fetch polygons and paths on mount
  useEffect(() => {
    fetchExistingPolygons();
  }, []);

  // Load editing lot polygon when map is ready and editingLot changes
  useEffect(() => {
    if (!editingLot || !isMapReady || !mapRef.current) return;

    // Find the polygon for this lot from existing polygons and load it
    const lotPolygon = existingPolygons.find(p => p.lot_number === editingLot.lot_number);
    if (lotPolygon && drawnItemsRef.current) {
      // Clear any existing drawn items
      drawnItemsRef.current.clearLayers();

      // Create editable polygon
      const editablePolygon = L.polygon(lotPolygon.coordinates, {
        color: "#10b981",
        weight: 3,
        fill: true,
        fillColor: "#10b981",
        fillOpacity: 0.2,
      });

      drawnItemsRef.current.addLayer(editablePolygon);
      setTempCoords(lotPolygon.coordinates);
      setTempCentroid(calculateCentroid(lotPolygon.coordinates));

      toast({ title: "Polygon Loaded", description: `Editing ${editingLot.display_name}` });
    }
  }, [editingLot, isMapReady, existingPolygons]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

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
      const map = L.map(mapContainerRef.current, {
        center: MAP_CONFIG.CENTER,
        zoom: MAP_CONFIG.DEFAULT_ZOOM,
        layers: [cartoLight],
      });

      // Layer Control
      const baseMaps = {
        Satellite: satellite,
        "CartoLight": cartoLight,
        "OpenStreetMap": osmLayer,
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

      // Walking paths
      L.polyline(walkingPathCoords, {
        color: PATH_PRIMARY_COLOR,
        weight: 8,
        opacity: 0.75,
      }).addTo(map);
      L.polyline(walkingPathCoords, {
        color: PATH_CENTER_COLOR,
        weight: 4,
        opacity: 0.9,
      }).addTo(map);

      // Existing Polygons Layer
      polygonsLayerRef.current = L.layerGroup().addTo(map);

      // Paths Layer
      pathsLayerRef.current = L.layerGroup().addTo(map);

      // Draw Control
      const drawnItems = new L.FeatureGroup();
      drawnItemsRef.current = drawnItems;
      map.addLayer(drawnItems);

      const drawControl = new (L.Control as any).Draw({
        edit: { featureGroup: drawnItems, remove: true, poly: { allowIntersection: false } },
        draw: {
          polygon: {
            allowIntersection: false,
            showArea: false,
            shapeOptions: { color: "#10b981", weight: 3 },
            drawError: { color: "#e03e3e", timeout: 2000 },
            repeatMode: false,
          },
          rectangle: {
            showArea: false,
            shapeOptions: { color: "#10b981", weight: 3 },
            repeatMode: false,
          },
          circle: false,
          marker: false,
          circlemarker: false,
          polyline: false,
        },
      });

      map.addControl(drawControl);

      // Draw Events
      map.on((L.Draw as any).Event.CREATED, (e: any) => {
        drawnItems.clearLayers();
        const layer = e.layer;
        drawnItems.addLayer(layer);

        let coords: [number, number][] = [];
        if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
          const latLngs = (layer as any).getLatLngs()[0] as any[];
          coords = latLngs.map((ll: any) => [ll.lat, ll.lng]);
        }

        const centroid = calculateCentroid(coords);
        setTempCoords(coords);
        setTempCentroid(centroid);

        toast({ title: "Boundary Set", description: "Enter Block & Lot details to continue." });
      });

      map.on((L.Draw as any).Event.DELETED, () => {
        setTempCoords(null);
        setTempCentroid(null);
        setEditingPolygonId(null);
      });

      map.on((L.Draw as any).Event.EDITED, () => {
        const layer = drawnItems.getLayers()[0];
        if (layer && (layer instanceof L.Polygon || layer instanceof L.Rectangle)) {
          const latLngs = (layer as any).getLatLngs()[0] as any[];
          const coords = latLngs.map((ll: any) => [ll.lat, ll.lng]) as [number, number][];
          const centroid = calculateCentroid(coords);
          setTempCoords(coords);
          setTempCentroid(centroid);
          toast({ title: "Polygon Updated", description: "Polygon has been modified." });
        }
      });

      map.whenReady(() => {
        setIsMapReady(true);
        setTimeout(() => map.invalidateSize(), 100);
      });

      mapRef.current = map;
    } catch (error) {
      toast({ title: "Map Initialization Error", description: "There was a problem loading the map.", variant: "destructive" });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [toast]);

  const handleEditPolygon = (poly: Polygon) => {
    // Ensure map is ready
    if (!mapRef.current || !drawnItemsRef.current || !isMapReady) {
      toast({ title: "Map Not Ready", description: "Please wait for the map to fully load.", variant: "destructive" });
      return;
    }

    // Clear previous drawing
    drawnItemsRef.current.clearLayers();

    // Load the polygon into the drawing tool
    const editablePolygon = L.polygon(poly.coordinates, {
      color: "#10b981",
      weight: 3,
      fill: true,
      fillColor: "#10b981",
      fillOpacity: 0.2,
    });
    
    drawnItemsRef.current.addLayer(editablePolygon);

    // Update state
    setEditingPolygonId(poly.id);
    setBlock(poly.block_name);
    setLot(poly.lot_number);
    setTempCoords(poly.coordinates);
    setTempCentroid(calculateCentroid(poly.coordinates));
    
    toast({ title: "Editing Polygon", description: `Editing Block ${poly.block_name} - Lot ${poly.lot_number}. Modify the polygon and save changes.` });
  };

  // Update existing polygons on map after they load
  useEffect(() => {
    if (!mapRef.current || !polygonsLayerRef.current || loadingPolygons) return;

    polygonsLayerRef.current.clearLayers();

    existingPolygons.forEach((poly) => {
      const polygon = L.polygon(poly.coordinates, {
        color: "#888888",
        weight: 1.5,
        fill: true,
        fillColor: poly.is_available ? "#cccccc" : "#aaaaaa",
        fillOpacity: 0.5,
      });

      polygon.addTo(polygonsLayerRef.current!);

      // Calculate centroid for label placement (guaranteed to be inside convex polygons)
      const latSum = poly.coordinates.reduce((sum, coord) => sum + coord[0], 0);
      const lngSum = poly.coordinates.reduce((sum, coord) => sum + coord[1], 0);
      const centroidLat = latSum / poly.coordinates.length;
      const centroidLng = lngSum / poly.coordinates.length;

      // Create label with improved styling to ensure it's visible inside polygon
      L.marker([centroidLat, centroidLng], {
        icon: L.divIcon({
          className: "lot-block-label",
          html: `<div style="font-size: 9px; font-weight: 700; color: #1a1a1a; text-shadow: 0 0 3px white, 1px 1px 0.5px white, -1px -1px 0.5px white; pointer-events: none; text-align: center;">B${poly.block_name}L${poly.lot_number}</div>`,
          iconSize: [50, 16],
          iconAnchor: [25, 8],
        }),
        interactive: false,
      }).addTo(polygonsLayerRef.current!);
    });
  }, [existingPolygons, loadingPolygons]);

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

  return (
    <div className="fixed inset-0 z-[50] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <Card className="w-full max-w-6xl mx-4 shadow-2xl border-0 overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <CardHeader className="bg-white border-b px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-serif font-bold text-gray-900 flex items-center gap-2">
                <Layers className="w-6 h-6 text-primary" />
                {editingLot ? "Edit Lot" : "Add New Lot"}
              </CardTitle>
              <CardDescription className="font-sans">
                {editingLot ? `Modify the polygon for ${editingLot.display_name}` : "Create a spatial lot container."}
              </CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onCancel} 
              className="hover:bg-primary/10 hover:text-primary text-gray-400 transition-colors rounded-full" 
              disabled={isSaving}
              title="Close without saving"
            >
              <X className="w-6 h-6" />
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
                    <Save className="w-4 h-4 mr-2" /> {editingLot ? "Update Lot" : "Save Lot"}
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
