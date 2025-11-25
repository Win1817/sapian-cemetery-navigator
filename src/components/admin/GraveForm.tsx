import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, BoxSelect } from "lucide-react";
import heic2any from "heic2any";
import { Badge } from "@/components/ui/badge";

interface GraveFormProps {
  grave?: any;
  onClose: () => void;
}

export const GraveForm = ({ grave, onClose }: GraveFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  
  // State for available lots (for selection)
  const [availableLots, setAvailableLots] = useState<any[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string>("");

  // Check if we are editing or creating a Lot (which is a polygon)
  const isLot = grave?.is_polygon && (grave?.polygon_coordinates?.length > 0 || grave?.centroid_lat);

  const [formData, setFormData] = useState({
    grave_name: grave?.grave_name || "",
    // Coordinates are kept in state for submission but hidden from UI
    latitude: grave?.latitude || "",
    longitude: grave?.longitude || "",
    grave_image_url: grave?.grave_image_url || "",
    date_of_birth: grave?.date_of_birth || "",
    date_of_death: grave?.date_of_death || "",
    additional_info: grave?.additional_info || "",
    is_polygon: isLot,
    polygon_coordinates: grave?.polygon_coordinates || null,
    centroid_lat: grave?.centroid_lat || null,
    centroid_lng: grave?.centroid_lng || null,
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

  // Fetch available lots when component mounts (only if we are adding a person)
  useEffect(() => {
    if (!isLot) {
      const fetchLots = async () => {
        const { data, error } = await supabase
          .from("graves")
          .select("id, grave_name, centroid_lat, centroid_lng, additional_info")
          .eq("is_polygon", true) // Only fetch lots/blocks
          .order("grave_name");
        
        if (!error && data) {
          setAvailableLots(data);
        }
      };
      fetchLots();
    }
  }, [isLot]);

  // Handle Lot Selection
  const handleLotSelect = (lotId: string) => {
    const lot = availableLots.find((l) => l.id === lotId);
    if (lot) {
      setSelectedLotId(lotId);
      // Auto-fill coordinates with the Lot's centroid (Hidden from user)
      setFormData((prev) => ({
        ...prev,
        latitude: lot.centroid_lat,
        longitude: lot.centroid_lng,
        additional_info: prev.additional_info 
          ? `${prev.additional_info}\nAssigned to: ${lot.grave_name}`
          : `Assigned to: ${lot.grave_name}`,
      }));

      toast({
        title: "Location Set",
        description: `Assigned to ${lot.grave_name}`,
      });
    }
  };

  const convertHeicToJpegFile = async (file: File): Promise<File> => {
    const blob = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    }) as Blob;

    return new File([blob], file.name.replace(/\.(heic|HEIC|heif|HEIF)$/i, ".jpg"), {
      type: "image/jpeg",
    });
  };

  const handleImageUpload = async (file: File) => {
    let uploadFile = file;

    if (file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif")) {
      uploadFile = await convertHeicToJpegFile(file);
    }

    const fileExt = uploadFile.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("grave-images")
      .upload(filePath, uploadFile, { upsert: true });

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from("grave-images")
      .getPublicUrl(filePath);

    return publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let imageUrl = formData.grave_image_url;

      if (imageFile) {
        imageUrl = await handleImageUpload(imageFile);
      }
      
      // Prepare submission data
      const baseData = {
        grave_name: formData.grave_name,
        grave_image_url: imageUrl,
        date_of_birth: formData.date_of_birth,
        date_of_death: formData.date_of_death,
        additional_info: formData.additional_info,
        // Use hidden state coordinates or centroid
        latitude: isLot ? formData.centroid_lat : parseFloat(formData.latitude as any),
        longitude: isLot ? formData.centroid_lng : parseFloat(formData.longitude as any),
      };

      const submissionData = {
        ...baseData,
        ...(isLot ? {
            is_polygon: true,
            polygon_coordinates: formData.polygon_coordinates,
            centroid_lat: formData.centroid_lat,
            centroid_lng: formData.centroid_lng,
        } : {
            is_polygon: false,
        }),
      };

      if (grave?.id) { 
        const { error } = await supabase
          .from("graves")
          .update(submissionData)
          .eq("id", grave.id);

        if (error) throw error;
        toast({ title: "Success", description: "Record updated successfully." });
      } else { 
        const { error } = await supabase.from("graves").insert(submissionData);
        if (error) throw error;
        toast({ title: "Success", description: "Record added successfully." });
      }

      onClose();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {isLot && (
        <Badge variant="default" className="bg-[#2d5f3f] hover:bg-green-700 mb-2">
          {grave?.id ? "Editing Cemetery Lot (Polygon)" : "Creating New Cemetery Lot"}
        </Badge>
      )}
      
      {/* 1. NAME (First) */}
      <div className="space-y-2">
        <Label htmlFor="grave_name">Name *</Label>
        <Input
          id="grave_name"
          value={formData.grave_name}
          onChange={(e) => setFormData({ ...formData, grave_name: e.target.value })}
          required
          placeholder={isLot ? "Lot 1 / Block A" : "Enter full name of deceased"}
        />
      </div>

      {/* 2. ASSIGN TO LOT (Second - Only for People) */}
      {!isLot && (
        <div className="space-y-2">
           <Label className="flex items-center gap-2">
             <BoxSelect className="w-4 h-4 text-muted-foreground" /> 
             Assign to Lot / Block
           </Label>
           <Select onValueChange={handleLotSelect} value={selectedLotId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select existing Lot..." />
            </SelectTrigger>
            <SelectContent>
              {availableLots.length === 0 ? (
                 <div className="p-2 text-sm text-muted-foreground">No lots available.</div>
              ) : (
                availableLots.map((lot) => (
                  <SelectItem key={lot.id} value={lot.id}>
                    {lot.grave_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <p className="text-[0.8rem] text-muted-foreground">
            Assigning to a lot automatically sets the location.
          </p>
        </div>
      )}

      {/* Coordinates UI REMOVED - Logic remains in background state */}

      {/* Image */}
      <div className="space-y-2">
        <Label htmlFor="image">Image</Label>
        <div className="flex items-center space-x-2">
          <Input
            id="image"
            type="file"
            accept="image/*,.heic,.heif"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            className="flex-1"
          />
          <Upload className="w-4 h-4 text-muted-foreground" />
        </div>
        {formData.grave_image_url && !imageFile && (
          <p className="text-xs text-green-600 mt-1">✓ Current image saved</p>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="date_of_birth">Date of Birth</Label>
          <Input
            id="date_of_birth"
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date_of_death">Date of Death</Label>
          <Input
            id="date_of_death"
            type="date"
            value={formData.date_of_death}
            onChange={(e) => setFormData({ ...formData, date_of_death: e.target.value })}
          />
        </div>
      </div>

      {/* Additional info */}
      <div className="space-y-2">
        <Label htmlFor="additional_info">Additional Information</Label>
        <Textarea
          id="additional_info"
          value={formData.additional_info}
          onChange={(e) => setFormData({ ...formData, additional_info: e.target.value })}
          placeholder={isLot ? "Block capacity, notes..." : "Epitaph, notes, or lot details..."}
          rows={3}
        />
      </div>

      {/* Buttons */}
      <div className="flex space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? "Saving..." : grave?.id ? "Update Record" : "Save Record"}
        </Button>
      </div>
    </form>
  );
};