// src/components/admin/GraveList.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Grave {
  id: string;
  grave_name: string;
  latitude: number;
  longitude: number;
  grave_image_url?: string;
  date_of_birth?: string;
  date_of_death?: string;
  additional_info?: string;
}

interface GraveListProps {
  onEdit: (grave: Grave) => void;
}

export const GraveList = ({ onEdit }: GraveListProps) => {
  const [graves, setGraves] = useState<Grave[]>([]);
  const [filteredGraves, setFilteredGraves] = useState<Grave[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedGrave, setSelectedGrave] = useState<Grave | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchGraves();
  }, []);

  useEffect(() => {
    const filtered = graves.filter((grave) =>
      grave.grave_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setFilteredGraves(filtered);
  }, [searchTerm, graves]);

  const fetchGraves = async () => {
    const { data, error } = await supabase
      .from("graves")
      .select("*")
      .order("grave_name");

    if (error) {
      toast({ title: "Error fetching graves", description: error.message, variant: "destructive" });
    } else {
      setGraves(data || []);
    }
    setLoading(false);
  };

  const handleGraveClick = (grave: Grave) => {
    setSelectedGrave(grave);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("graves").delete().eq("id", deleteId);
    if (error) {
      toast({ title: "Error deleting grave", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Grave deleted", description: "The grave record has been removed." });
      fetchGraves();
    }
    setDeleteId(null);
  };

  const getTimeSinceDeath = (dob: string, dod: string) => {
    if (!dod) return "-";
    const deathDate = new Date(dod);
    const now = new Date();
    const diffMs = now.getTime() - deathDate.getTime();
    const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30.44)) % 12;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) % 30;
    return `${diffYears}y ${diffMonths}m ${diffDays}d`;
  };

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading graves...</div>;
  if (graves.length === 0)
    return (
      <Card className="p-8 text-center shadow-soft">
        <p className="text-muted-foreground">No graves recorded yet.</p>
      </Card>
    );

  return (
    <>
      <div className="mb-4">
        <Input
          placeholder="Search graves by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <p className="text-sm text-muted-foreground mt-1">
          Showing {filteredGraves.length} of {graves.length} graves
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGraves.map((grave) => (
          <Card key={grave.id} className="p-4 shadow-soft hover:shadow-medium transition-shadow">
            <div
              className="relative w-full h-48 mb-3 rounded-md overflow-hidden bg-gray-100 cursor-pointer"
              onClick={() => handleGraveClick(grave)}
            >
              {grave.grave_image_url ? (
                <img
                  src={grave.grave_image_url}
                  alt={grave.grave_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                  No Image
                </div>
              )}
            </div>

            <h3
              className="font-serif font-bold text-lg mb-2 cursor-pointer hover:text-primary transition-colors"
              onClick={() => handleGraveClick(grave)}
            >
              {grave.grave_name}
            </h3>

            <div className="text-sm text-muted-foreground mb-2 space-y-1">
              <p>DOB: {grave.date_of_birth ? new Date(grave.date_of_birth).toLocaleDateString() : "-"}</p>
              <p>DOD: {grave.date_of_death ? new Date(grave.date_of_death).toLocaleDateString() : "-"}</p>
              <p>Location: {grave.latitude?.toFixed(5)}, {grave.longitude?.toFixed(5)}</p>
              {grave.date_of_death && (
                <p>Time Since Death: {getTimeSinceDeath(grave.date_of_birth || "", grave.date_of_death)}</p>
              )}
            </div>

            {grave.additional_info && <p className="text-sm mb-3 line-clamp-2">{grave.additional_info}</p>}

            <div className="flex space-x-2">
              <Button onClick={() => onEdit(grave)} size="sm" variant="outline" className="flex-1">
                <Pencil className="w-3 h-3 mr-1" /> Edit
              </Button>
              <Button
                onClick={() => setDeleteId(grave.id)}
                size="sm"
                variant="destructive"
                className="flex-1"
              >
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Delete Grave Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Grave Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the grave record from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grave Details Dialog */}
      <Dialog open={!!selectedGrave} onOpenChange={() => setSelectedGrave(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">{selectedGrave?.grave_name}</DialogTitle>
            <DialogDescription>
              Detailed view of the grave record.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedGrave?.grave_image_url && (
              <div className="relative w-full h-64 rounded-md overflow-hidden bg-gray-100">
                <img
                  src={selectedGrave.grave_image_url}
                  alt={selectedGrave.grave_name}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date of Birth:</p>
                <p className="text-lg">{selectedGrave?.date_of_birth ? new Date(selectedGrave.date_of_birth).toLocaleDateString() : "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date of Death:</p>
                <p className="text-lg">{selectedGrave?.date_of_death ? new Date(selectedGrave.date_of_death).toLocaleDateString() : "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Latitude:</p>
                <p className="text-lg">{selectedGrave?.latitude?.toFixed(6)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Longitude:</p>
                <p className="text-lg">{selectedGrave?.longitude?.toFixed(6)}</p>
              </div>
            </div>

            {selectedGrave?.date_of_death && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Time Since Death:</p>
                <p className="text-lg">{getTimeSinceDeath(selectedGrave.date_of_birth || "", selectedGrave.date_of_death)}</p>
              </div>
            )}

            {selectedGrave?.additional_info && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Additional Information:</p>
                <p className="text-base whitespace-pre-wrap">{selectedGrave.additional_info}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
