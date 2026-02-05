import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import CemeteryMap, { MapPolygon } from "@/components/map/CemeteryMap";
import SearchBar from "@/components/map/SearchBar";
import { MapPin, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MAP_CONFIG } from "@/components/map/mapConfig";

interface Grave {
  id: string;
  grave_name: string;
  latitude: number | null;
  longitude: number | null;
  grave_image_url?: string;
  date_of_birth?: string;
  date_of_death?: string;
  additional_info?: string;
}

const Index = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [selectedGrave, setSelectedGrave] = useState<Grave | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);

  // map data
  const [polygons, setPolygons] = useState<MapPolygon[]>([]);
  const [graves, setGraves] = useState<any[]>([]);
  const [loadingPolygons, setLoadingPolygons] = useState(false);

  useEffect(() => {
    checkUser();
    requestLocation();
    loadPolygons();
  }, []);

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      setUser(session.user);
      checkAdminStatus(session.user.id);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) checkAdminStatus(session.user.id);
        else setIsAdmin(false);
      }
    );

    return () => subscription.unsubscribe();
  };

  const checkAdminStatus = async (userId: string) => {
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    setIsAdmin(!!roles);
  };

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation([position.coords.latitude, position.coords.longitude]);
          setLocationEnabled(true);
          toast({
            title: "Location enabled",
            description: "Your location will be used for walking directions.",
            duration: 4000,
            className: "z-[70]",
          });
        },
        () => {
          setLocationEnabled(false);
          toast({
            title: "Location access denied",
            description: "You can manually set your start point on the map.",
            variant: "destructive",
            duration: 4000,
            className: "z-[70]",
          });
        }
      );
    }
  };

  // ---------------------
  // Load polygons from Supabase and convert GeoJSON -> [lat, lng][]
  // Graves are now assigned directly via lot.grave_id FK
  // ---------------------
  const loadPolygons = async () => {
    setLoadingPolygons(true);
    try {
      // Fetch lot_polygons with their associated lots data including the grave_id
      const { data: polygonsData, error: polygonsError } = await supabase
        .from("lot_polygons")
        .select(`
          id, 
          coordinates, 
          centroid_lat, 
          centroid_lng,
          lots!inner (
            id,
            lot_number,
            block_id,
            is_available,
            grave_id,
            blocks (block_name)
          )
        `)
        .order("created_at", { ascending: true });

      if (polygonsError) {
        toast({ title: "Error", description: "Failed to load polygons", variant: "destructive" });
        setLoadingPolygons(false);
        return;
      }

      if (!polygonsData || polygonsData.length === 0) {
        setPolygons([]);
        setLoadingPolygons(false);
        return;
      }

      // Collect all grave IDs from lots to fetch their details
      const graveIds = new Set<string>();
      polygonsData.forEach((row: any) => {
        const lot = row.lots?.[0];
        if (lot?.grave_id) {
          graveIds.add(lot.grave_id);
        }
      });

      // Fetch grave details for all assigned graves
      let gravesMap = new Map<string, any>();
      try {
        if (graveIds.size > 0) {
          const { data: gravesData, error: gravesError } = await supabase
            .from("graves")
            .select("*")
            .in("id", Array.from(graveIds));

          console.log(`📊 GRAVES DEBUG: Fetched ${gravesData?.length || 0} grave details for ${graveIds.size} assigned graves`);
          
          if (!gravesError && gravesData && gravesData.length > 0) {
            gravesData.forEach((grave: any) => {
              gravesMap.set(grave.id, grave);
            });
          }
          console.log(`📊 gravesMap size: ${gravesMap.size}`);
        } else {
          console.log(`📊 GRAVES DEBUG: No graves assigned to any lots`);
        }
      } catch (err) {
        console.error("Error fetching grave details:", err);
      }

      // Map polygons with lot data and grave info
      const mapped: MapPolygon[] = polygonsData.map((row: any) => {
        // coordinates may be an object (JSONB) or a string
        const raw = row.coordinates;
        const geo = typeof raw === "string" ? JSON.parse(raw) : raw;

        // If stored as GeoJSON { type: 'Polygon', coordinates: [ [ [lng,lat], ... ] ] }
        let coordsLatLng: [number, number][] = [];

        if (geo && geo.type === "Polygon" && Array.isArray(geo.coordinates)) {
          // geo.coordinates[0] is outer ring: [ [lng,lat], ... ]
          const outer = geo.coordinates[0] || [];
          coordsLatLng = outer.map((pair: any) => {
            const lng = Number(pair[0]);
            const lat = Number(pair[1]);
            return [lat, lng] as [number, number];
          });
        } else if (Array.isArray(geo)) {
          // legacy: stored as array of [lat, lng]
          coordsLatLng = geo.map((pair: any) => [Number(pair[0]), Number(pair[1])] as [number, number]);
        }

        const lot = row.lots?.[0];
        // Get the grave assigned to this lot (via lot.grave_id FK)
        const grave = lot?.grave_id ? gravesMap.get(lot.grave_id) : null;

        return {
          id: row.id,
          name: `Block ${lot?.blocks?.block_name || "?"} - Lot ${lot?.lot_number || "?"}`,
          coordinates: coordsLatLng,
          type: "lot",
          is_available: lot?.is_available ?? true,
          grave_id: lot?.grave_id || null,  // Use lot.grave_id directly
          grave: grave || null, // Include the full grave object for map rendering
        };
      });

      // Extract all graves for mapConfig
      setGraves(Array.from(gravesMap.values()));
      setPolygons(mapped);
      
    } catch (err) {
      toast({ title: "Error", description: "Failed to load polygons", variant: "destructive" });
    } finally {
      setLoadingPolygons(false);
    }
  };

  const handleSelectGrave = (grave: Grave) => {
    setSelectedGrave(grave);
  };

  const calculateAge = (dob: string, dod?: string) => {
    const birth = new Date(dob);
    const end = dod ? new Date(dod) : new Date();
    let age = end.getFullYear() - birth.getFullYear();
    const m = end.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age--;
    return age;
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString(undefined, { year: "numeric", month: "long", day: "numeric" });

  // Build the runtime mapConfig object passed to CemeteryMap
  const runtimeMapConfig = {
    cemeteryBoundary: MAP_CONFIG.cemeteryBoundary ?? null,
    polygons: polygons,
    graves: graves, // Include graves with assigned lots
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Header */}
      <header className="bg-card shadow-soft border-b z-20 relative w-full">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center overflow-hidden">
              <img src="/Logo.png" alt="Logo" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
            </div>
            <div className="leading-tight">
              <h1 className="text-xl sm:text-2xl font-serif font-bold">Sapian Cemetery</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Navigation & Grave Locator</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 justify-end">
            {isAdmin && (
              <Button
                onClick={() => navigate("/admin")}
                variant="outline"
                size="sm"
                className="hover:bg-[#5D866C] hover:text-white border border-primary/40 flex items-center"
              >
                <Settings className="w-4 h-4 mr-2" />
                Administrator
              </Button>
            )}
            {user ? (
              <Button
                onClick={() => supabase.auth.signOut()}
                variant="outline"
                size="sm"
                className="hover:bg-[#5D866C] hover:text-white border border-primary/40"
              >
                Sign Out
              </Button>
            ) : (
              <Button
                onClick={() => navigate("/auth")}
                variant="outline"
                size="sm"
                className="hover:bg-[#5D866C] hover:text-white border border-primary/40"
              >
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-2 sm:py-6 relative z-10">
        {/* Search + Location */}
        <div className="mb-2 sm:mb-4 flex flex-row items-center justify-between gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <SearchBar onSelectGrave={handleSelectGrave} />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {locationEnabled && (
              <div className="flex items-center space-x-1 px-2 sm:px-3 py-1 bg-primary/10 rounded-full whitespace-nowrap">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <span className="text-xs sm:text-sm font-medium text-primary">Location Active</span>
              </div>
            )}
            {!userLocation && (
              <Button
                onClick={requestLocation}
                variant="outline"
                size="sm"
                className="shadow-soft hover:bg-[#5D866C] hover:text-white text-xs sm:text-sm px-2 sm:px-3 flex-shrink-0"
              >
                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Enable</span> Location
              </Button>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[calc(100vh-220px)] rounded-lg overflow-hidden shadow-medium border border-border/50 relative z-0">
          <CemeteryMap
            selectedGrave={selectedGrave}
            setSelectedGrave={(grave) => setSelectedGrave(grave)}
            userLocation={userLocation}
            mapConfig={runtimeMapConfig}
          />
        </div>

        {/* Selected Grave Details */}
        {selectedGrave && (
          <div className="mt-4 bg-card p-4 rounded-lg shadow-soft flex flex-col sm:flex-row gap-4 items-start">
            {selectedGrave.grave_image_url && (
              <img
                src={selectedGrave.grave_image_url}
                alt={selectedGrave.grave_name}
                className="w-32 h-32 object-cover rounded-lg flex-shrink-0"
              />
            )}
            <div className="flex-1 text-left space-y-1">
              <p className="font-serif font-bold text-lg">NAME: {selectedGrave.grave_name}</p>
              {selectedGrave.date_of_birth && (
                <p className="text-sm">AGE: {calculateAge(selectedGrave.date_of_birth, selectedGrave.date_of_death)} yrs old</p>
              )}
              {selectedGrave.date_of_birth && (
                <p className="text-sm">BIRTH DATE: {formatDate(selectedGrave.date_of_birth)}</p>
              )}
              {selectedGrave.date_of_death && (
                <p className="text-sm">DATE OF DEATH: {formatDate(selectedGrave.date_of_death)}</p>
              )}
              {selectedGrave.additional_info && (
                <p className="text-sm">ADDITIONAL INFO: {selectedGrave.additional_info}</p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;