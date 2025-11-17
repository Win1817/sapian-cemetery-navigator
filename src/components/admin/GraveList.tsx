// src/components/admin/GraveList.tsx
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchGraves();
  }, []);

  const fetchGraves = async () => {
    const { data, error } = await supabase.from("graves").select("*").order("grave_name");
    if (error) {
      toast({ title: "Error fetching graves", description: error.message, variant: "destructive" });
    } else {
      setGraves(data || []);
    }
    setLoading(false);
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {graves.map((grave) => (
          <Card key={grave.id} className="p-4 shadow-soft hover:shadow-medium transition-shadow">
            {grave.grave_image_url && (
              <img
                src={grave.grave_image_url}
                alt={grave.grave_name}
                className="w-full h-48 object-cover rounded-md mb-3"
              />
            )}
            <h3 className="font-serif font-bold text-lg mb-2">{grave.grave_name}</h3>

            <div className="text-sm text-muted-foreground mb-2 space-y-1">
              <p>DOB: {grave.date_of_birth ? new Date(grave.date_of_birth).toLocaleDateString() : "-"}</p>
              <p>DOD: {grave.date_of_death ? new Date(grave.date_of_death).toLocaleDateString() : "-"}</p>
              <p>Location: {grave.latitude?.toFixed(5)}, {grave.longitude?.toFixed(5)}</p>
              {grave.date_of_death && <p>Time Since Death: {getTimeSinceDeath(grave.date_of_birth || "", grave.date_of_death)}</p>}
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
    </>
  );
};
