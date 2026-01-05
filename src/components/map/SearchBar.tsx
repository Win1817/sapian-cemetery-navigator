// src/components/map/SearchBar.tsx
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Grave } from "./CemeteryMap";

interface SearchBarProps {
  onSelectGrave: (grave: Grave) => void;
}

const SearchBar = ({ onSelectGrave }: SearchBarProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [graves, setGraves] = useState<Grave[]>([]);
  const [filteredGraves, setFilteredGraves] = useState<Grave[]>([]);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch graves on mount
  useEffect(() => {
    const fetchGraves = async () => {
      const { data, error } = await supabase.from("graves").select("*").order("grave_name");
      if (error) return;
      setGraves(data || []);
    };
    fetchGraves();
  }, []);

  // Filter graves based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredGraves([]);
      setShowResults(false);
      return;
    }

    const filtered = graves.filter((grave) =>
      grave.grave_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredGraves(filtered);
    setShowResults(true);
  }, [searchTerm, graves]);

  const handleSelect = (grave: Grave) => {
    onSelectGrave(grave);
    setSearchTerm("");
    setShowResults(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full sm:max-w-md">
      <div className="relative">
        <div className="absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
        </div>

        <Input
          ref={inputRef}
          type="text"
          placeholder="Search for a name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => searchTerm && setShowResults(true)}
          className="pl-9 sm:pl-12 text-sm sm:text-base map-search"
        />
      </div>

      {showResults && filteredGraves.length > 0 && (
        <Card className="absolute z-50 w-full mt-2 max-h-60 overflow-y-auto shadow-medium">
          <div className="p-2">
            {filteredGraves.map((grave) => (
              <button
                key={grave.id}
                onClick={() => handleSelect(grave)}
                className={cn(
                  "w-full text-left px-3 py-2 rounded hover:bg-accent transition-colors",
                  "focus:outline-none focus:bg-accent"
                )}
              >
                <div className="font-medium">{grave.grave_name}</div>
                {grave.date_of_birth && grave.date_of_death && (
                  <div className="text-xs text-muted-foreground">
                    {new Date(grave.date_of_birth).getFullYear()} -{" "}
                    {new Date(grave.date_of_death).getFullYear()}
                  </div>
                )}
              </button>
            ))}
          </div>
        </Card>
      )}

      {showResults && filteredGraves.length === 0 && searchTerm && (
        <Card className="absolute z-50 w-full mt-2 p-4 text-center shadow-medium">
          <p className="text-sm text-muted-foreground">
            No graves found matching "{searchTerm}"
          </p>
        </Card>
      )}
    </div>
  );
};

export default SearchBar;
