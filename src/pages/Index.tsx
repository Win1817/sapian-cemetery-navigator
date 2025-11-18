// src/pages/Index.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import CemeteryMap from "@/components/map/CemeteryMap";
import SearchBar from "@/components/map/SearchBar";
import { Leaf, MapPin, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  useEffect(() => {
    checkUser();
    requestLocation();
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

  const handleStartPointSelected = (location: [number, number]) => {
    setUserLocation(location);
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
    new Date(dateStr).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden">

      {/* Header */}
      <header className="bg-card shadow-soft border-b z-20 relative w-full">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-primary rounded-full flex items-center justify-center">
              <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
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
      <main className="flex-1 container mx-auto px-4 py-6 relative z-10">

        {/* Search + Location */}
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <SearchBar onSelectGrave={handleSelectGrave} />
          <div className="flex items-center space-x-2">
            {locationEnabled && (
              <div className="flex items-center space-x-1 px-3 py-1 bg-primary/10 rounded-full">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-primary">Location Active</span>
              </div>
            )}
            {!userLocation && (
              <Button
                onClick={requestLocation}
                variant="outline"
                size="sm"
                className="shadow-soft hover:bg-[#5D866C] hover:text-white"
              >
                <MapPin className="w-4 h-4 mr-2" />
                Enable Location
              </Button>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="h-[calc(100vh-220px)] rounded-lg overflow-hidden shadow-medium border border-border/50 relative z-0">
          <CemeteryMap
            selectedGrave={selectedGrave}
            setSelectedGrave={setSelectedGrave}
            userLocation={userLocation}
            onStartPointSelected={handleStartPointSelected}
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
