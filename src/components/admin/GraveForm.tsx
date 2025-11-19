// src/components/admin/GraveForm.tsx
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload } from "lucide-react";
import heic2any from "heic2any";

interface GraveFormProps {
  grave?: any;
  onClose: () => void;
}

export const GraveForm = ({ grave, onClose }: GraveFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    grave_name: grave?.grave_name || "",
    latitude: grave?.latitude || "",
    longitude: grave?.longitude || "",
    grave_image_url: grave?.grave_image_url || "",
    date_of_birth: grave?.date_of_birth || "",
    date_of_death: grave?.date_of_death || "",
    additional_info: grave?.additional_info || "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);

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

      const graveData = {
        ...formData,
        grave_image_url: imageUrl,
        latitude: parseFloat(formData.latitude as any),
        longitude: parseFloat(formData.longitude as any),
      };

      if (grave) {
        const { error } = await supabase
          .from("graves")
          .update(graveData)
          .eq("id", grave.id);

        if (error) throw error;

        toast({
          title: "Grave updated",
          description: "The grave record has been updated successfully.",
        });
      } else {
        const { error } = await supabase.from("graves").insert(graveData);

        if (error) throw error;

        toast({
          title: "Grave added",
          description: "New grave record has been added successfully.",
        });
      }

      onClose();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="grave_name">Name *</Label>
        <Input
          id="grave_name"
          value={formData.grave_name}
          onChange={(e) => setFormData({ ...formData, grave_name: e.target.value })}
          required
          placeholder="Enter full name"
        />
      </div>

      {/* Latitude & Longitude */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="latitude">Latitude *</Label>
          <Input
            id="latitude"
            type="number"
            step="any"
            value={formData.latitude}
            onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
            required
            placeholder="e.g., 14.5678"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="longitude">Longitude *</Label>
          <Input
            id="longitude"
            type="number"
            step="any"
            value={formData.longitude}
            onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
            required
            placeholder="e.g., 120.9876"
          />
        </div>
      </div>

      {/* Image */}
      <div className="space-y-2">
        <Label htmlFor="image">Grave Image</Label>
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
          <p className="text-xs text-muted-foreground">
            Current image will be kept if no new file is uploaded
          </p>
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
          placeholder="Any additional details..."
          rows={3}
        />
      </div>

      {/* Buttons */}
      <div className="flex space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={loading} className="flex-1">
          {loading ? "Saving..." : grave ? "Update Grave" : "Add Grave"}
        </Button>
      </div>
    </form>
  );
};