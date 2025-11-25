import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Leaf,
  LogOut,
  Plus,
  Download,
  Users,
  Shield,
  Square,
  Loader2,
  GanttChart,
  MapPin,
  Search,
  Trash2,
  Edit2,
  Link2,
  Unlink,
} from "lucide-react";
import { GraveList } from "@/components/admin/GraveList";
import { GraveForm } from "@/components/admin/GraveForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
import { LotDrawingMap } from "@/components/admin/LotDrawingMapPlaceholder";

// --- INTERFACES ---
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

interface LotData {
  polygon_coordinates: [number, number][]; // [[lng, lat], ...]
  centroid_lat: number;
  centroid_lng: number;
  block: string;
  lot: string;
}

interface Lot {
  id: string;
  lot_number: string;
  block_name: string;
  display_name: string;
  is_available: boolean;
  centroid_lat: number;
  centroid_lng: number;
  created_at: string;
}

type AdminView = "graves" | "users" | "lots" | "form";

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Lot Drawing State
  const [showLotDrawing, setShowLotDrawing] = useState(false);
  const [isSavingLot, setIsSavingLot] = useState(false);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [lotFilter, setLotFilter] = useState<"all" | "available" | "assigned">("all");
  const [deletingLotId, setDeletingLotId] = useState<string | null>(null);
  const [editingLot, setEditingLot] = useState<Lot | null>(null);
  const [assigningLotId, setAssigningLotId] = useState<string | null>(null);
  const [gravesWithoutLots, setGravesWithoutLots] = useState<Grave[]>([]);
  const [loadingGravesForAssign, setLoadingGravesForAssign] = useState(false);

  // Auth & View State
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<AdminView>("graves");
  const [editingGrave, setEditingGrave] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [refreshGraves, setRefreshGraves] = useState(false);

  // Export Dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportGraves, setExportGraves] = useState<Grave[]>([]);
  const [selectedGravesForExport, setSelectedGravesForExport] = useState<Set<string>>(new Set());
  const [searchExport, setSearchExport] = useState("");
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "pdf">("json");

  // --- EFFECTS ---
  useEffect(() => {
    checkAdminStatus();
  }, []);

  useEffect(() => {
    if (currentView === "users" && users.length === 0) fetchUsers();
    if (currentView === "lots") fetchLots();
  }, [currentView]);

  // --- AUTH ---
  const checkAdminStatus = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return navigate("/auth");

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roles) {
      toast({ title: "Access denied", description: "Admin only.", variant: "destructive" });
      return navigate("/");
    }

    setIsAdmin(true);
    setLoading(false);
  };

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase.rpc("get_admin_users");
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast({ title: "Failed to load users", description: err.message, variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (userId === session?.user.id) {
      toast({ title: "Cannot modify your own role", variant: "destructive" });
      return;
    }

    try {
      if (isCurrentlyAdmin) {
        await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        toast({ title: "Admin role removed" });
      } else {
        await supabase.from("user_roles").upsert({ user_id: userId, role: "admin" });
        toast({ title: "Admin role assigned" });
      }
      fetchUsers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  // --- GRAVE HANDLERS ---
  const handleEdit = (grave: any) => {
    setEditingGrave(grave);
    setCurrentView("form");
  };

  const handleFormClose = () => {
    setCurrentView("graves");
    setEditingGrave(null);
    setRefreshGraves((prev) => !prev);
    fetchLots();
  };

  // --- LOTS: FULLY WORKING WITH YOUR SCHEMA ---
  const fetchLots = async () => {
    setLoadingLots(true);
    try {
      const { data, error } = await supabase
        .from("lots")
        .select(`
          id,
          lot_number,
          is_available,
          created_at,
          block:blocks!inner (block_name),
          polygon_id!inner (centroid_lat, centroid_lng)
        `)
        .order("lot_number");

      if (error) throw error;

      const mappedLots: Lot[] = (data || []).map((lot: any) => ({
        id: lot.id,
        lot_number: lot.lot_number,
        block_name: lot.block?.block_name || "Unknown",
        display_name: `Block ${lot.block?.block_name || "?"} - Lot ${lot.lot_number}`,
        is_available: lot.is_available,
        centroid_lat: lot.polygon_id?.centroid_lat || 0,
        centroid_lng: lot.polygon_id?.centroid_lng || 0,
        created_at: lot.created_at,
      }));

      console.log(`📋 LOTS DEBUG: Fetched ${mappedLots.length} lots:`, mappedLots.map(l => ({ 
        name: l.display_name, 
        is_available: l.is_available 
      })));

      setLots(mappedLots);
    } catch (err: any) {
      toast({ title: "Failed to load lots", description: err.message, variant: "destructive" });
      setLots([]);
    } finally {
      setLoadingLots(false);
    }
  };

  const handleAddLot = () => setShowLotDrawing(true);

  const handleEditLot = (lot: Lot) => {
    setEditingLot(lot);
    setShowLotDrawing(true);
  };

  const fetchGravesWithoutLots = async () => {
    setLoadingGravesForAssign(true);
    try {
      // Fetch all graves - relationship tracking via lot_id doesn't exist yet
      // In the future, this could be filtered once the database schema is updated
      const { data: allGraves, error: gravesError } = await supabase
        .from("graves")
        .select("*")
        .order("grave_name");

      if (gravesError) throw gravesError;

      setGravesWithoutLots(allGraves || []);
    } catch (err: any) {
      toast({ title: "Error", description: "Failed to load graves", variant: "destructive" });
    } finally {
      setLoadingGravesForAssign(false);
    }
  };

  const handleAssignLot = async (lotId: string, graveId: string) => {
    try {
      console.log(`📌 ASSIGNING: Grave ${graveId} to Lot ${lotId}`);
      
      // Update the lot to assign the grave and mark as not available
      const { error: lotError } = await (supabase.from("lots") as any)
        .update({ grave_id: graveId, is_available: false })
        .eq("id", lotId);

      if (lotError) throw lotError;

      console.log(`✅ ASSIGNED: Grave ${graveId} to Lot ${lotId}`);
      toast({ title: "Success!", description: "Lot has been assigned to grave" });
      setAssigningLotId(null);
      fetchLots();
      fetchGravesWithoutLots();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to assign lot", variant: "destructive" });
    }
  };

  const handleUnassignLot = async (lotId: string) => {
    try {
      console.log(`📌 UNASSIGNING: Lot ${lotId}`);
      
      // Update the lot to clear grave_id and mark as available
      const { error: lotError } = await (supabase.from("lots") as any)
        .update({ grave_id: null, is_available: true })
        .eq("id", lotId);

      if (lotError) throw lotError;

      console.log(`✅ UNASSIGNED: Lot ${lotId}`);
      toast({ title: "Success!", description: "Grave has been unassigned from lot" });
      fetchLots();
      fetchGravesWithoutLots();
      setRefreshGraves((prev) => !prev);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to unassign lot", variant: "destructive" });
    }
  };

  const handleUnassignLotById = async (lotId: string) => {
    try {
      console.log(`📌 UNASSIGNING LOT BY ID: ${lotId}`);
      
      // Simply clear the grave_id from the lot and mark as available
      const { error: lotError } = await (supabase.from("lots") as any)
        .update({ grave_id: null, is_available: true })
        .eq("id", lotId);

      if (lotError) throw lotError;

      console.log(`✅ LOT UNASSIGNED: ${lotId}`);
      toast({ title: "Success!", description: "Grave has been unassigned from lot" });
      fetchLots();
      fetchGravesWithoutLots();
      setRefreshGraves((prev) => !prev);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to unassign lot", variant: "destructive" });
    }
  };

  const handleDeleteLot = async (lotId: string) => {
    try {
      // The lot.grave_id foreign key has ON DELETE SET NULL, so graves will be auto-cleared
      // No need to manually unassign them

      // Get the polygon_id associated with this lot
      const { data: lotData, error: fetchError } = await supabase
        .from("lots")
        .select("polygon_id")
        .eq("id", lotId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the lot
      const { error: deleteError } = await supabase.from("lots").delete().eq("id", lotId);
      if (deleteError) throw deleteError;

      // Delete the associated polygon if it exists
      if (lotData?.polygon_id) {
        await supabase.from("lot_polygons").delete().eq("id", lotData.polygon_id);
      }
      
      toast({
        title: "Lot deleted",
        description: "The lot and its polygon have been removed from the database.",
      });
      fetchLots();
    } catch (err: any) {
      toast({
        title: "Failed to delete lot",
        description: err.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setDeletingLotId(null);
    }
  };

  // FINAL FIXED handleLotSaved — handles both create and edit
  const handleLotSaved = async (lotData: LotData) => {
    setIsSavingLot(true);
    try {
      if (editingLot) {
        // Update existing lot by modifying the coordinates and lot info directly
        // First, unassign any graves from this lot to avoid constraint issues
        const { data: gravesWithLot } = await supabase
          .from("graves")
          .select("id")
          .eq("lot_block_id", editingLot.id);

        if (gravesWithLot && gravesWithLot.length > 0) {
          for (const grave of gravesWithLot) {
            await supabase
              .from("graves")
              .update({ lot_block_id: null })
              .eq("id", grave.id);
          }
        }

        // Get the polygon_id
        const { data: lotRecord } = await supabase
          .from("lots")
          .select("polygon_id, block_id")
          .eq("id", editingLot.id)
          .single();

        if (!lotRecord) throw new Error("Lot not found");

        // Update polygon coordinates if polygon exists
        if (lotRecord.polygon_id) {
          try {
            const { error: polygonError } = await supabase
              .from("lot_polygons")
              .update({
                coordinates: lotData.polygon_coordinates,
                centroid_lat: lotData.centroid_lat,
                centroid_lng: lotData.centroid_lng,
              })
              .eq("id", lotRecord.polygon_id);

            if (polygonError) {
              throw polygonError;
            }
          } catch (polyErr: any) {
            // Log polygon update error but continue with lot update
            console.warn("Polygon update warning:", polyErr.message);
            toast({
              title: "Polygon Update Warning",
              description: "Could not update polygon coordinates, but lot data will be saved.",
              variant: "default",
            });
          }
        }

        // Get or create block
        let blockId = lotRecord.block_id;
        if (!blockId) {
          const { data: blockData, error: blockError } = await supabase
            .from("blocks")
            .select("id")
            .eq("block_name", lotData.block.trim())
            .single();

          if (blockError && blockError.code !== "PGRST116") {
            throw blockError;
          }

          if (blockData) {
            blockId = blockData.id;
          } else {
            const { data: newBlock, error: createBlockError } = await supabase
              .from("blocks")
              .insert({ block_name: lotData.block.trim() })
              .select("id")
              .single();

            if (createBlockError) throw createBlockError;
            blockId = newBlock.id;
          }
        }

        // Update lot
        const { error: lotError } = await supabase
          .from("lots")
          .update({
            lot_number: lotData.lot.trim(),
            block_id: blockId,
          })
          .eq("id", editingLot.id);

        if (lotError) throw lotError;

        toast({
          title: "Success!",
          description: `Lot ${lotData.lot} in Block ${lotData.block} has been updated`,
        });
      } else {
        // Create new lot
        const { error } = await supabase.rpc("create_lot_with_polygon_new", {
          _block_name: lotData.block.trim(),
          _lot_number: lotData.lot.trim(),
          _coordinates: lotData.polygon_coordinates,
          _centroid_lat: lotData.centroid_lat,
          _centroid_lng: lotData.centroid_lng,
        });

        if (error) throw error;

        toast({
          title: "Success!",
          description: `Lot ${lotData.lot} created in Block ${lotData.block}`,
        });
      }

      setShowLotDrawing(false);
      setEditingLot(null);
      fetchLots();
    } catch (err: any) {
      if (err.message?.includes("lots_lot_number_block_id_key")) {
        toast({
          title: "Duplicate",
          description: `Lot "${lotData.lot}" already exists in Block "${lotData.block}"`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to save lot",
          description: err.message || "Please try again",
          variant: "destructive",
        });
      }
    } finally {
      setIsSavingLot(false);
    }
  };

  // --- EXPORT (unchanged) ---
  const handleOpenExport = async () => {
    const { data, error } = await supabase.from("graves").select("*").order("grave_name");
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }
    setExportGraves(data || []);
    setSelectedGravesForExport(new Set());
    setSearchExport("");
    setExportFormat("json");
    setExportDialogOpen(true);
  };

  const toggleGraveForExport = (id: string) => {
    setSelectedGravesForExport(prev => {
      const set = new Set(prev);
      set.has(id) ? set.delete(id) : set.add(id);
      return set;
    });
  };

  const handleExportGraves = async () => {
    const data = selectedGravesForExport.size > 0
      ? exportGraves.filter(g => selectedGravesForExport.has(g.id))
      : exportGraves;

    if (data.length === 0) {
      toast({ title: "No data", description: "No graves to export." });
      return;
    }

    const filename = selectedGravesForExport.size > 0 ? "selected_graves" : "all_graves";

    if (exportFormat === "json") {
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${filename}.json`);
    } else if (exportFormat === "csv") {
      const headers = Object.keys(data[0]);
      const csv = [headers.join(","), ...data.map(row => headers.map(h => `"${(row as any)[h] || ""}"`).join(","))].join("\n");
      saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
    } else if (exportFormat === "pdf") {
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(16);
      doc.text(selectedGravesForExport.size > 0 ? "Selected Graves" : "All Graves", 10, y);
      y += 10;
      doc.setFontSize(10);
      data.forEach((row, i) => {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.text(`${i + 1}. ${row.grave_name}`, 10, y);
        doc.text(`DOB: ${row.date_of_birth || "-"} | DOD: ${row.date_of_death || "-"}`, 10, y + 5);
        y += 12;
      });
      doc.save(`${filename}.pdf`);
    }

    toast({ title: "Export successful", description: `${data.length} records exported.` });
    setExportDialogOpen(false);
  };

  const filteredExportGraves = exportGraves.filter(g =>
    g.grave_name.toLowerCase().includes(searchExport.toLowerCase())
  );

  // --- VIEWS ---
  const GraveView = () => (
    <>
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-serif font-bold">Grave Records</h2>
          <p className="text-muted-foreground">Manage cemetery graves and locations</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCurrentView("form")} size="sm">
            <Plus className="w-4 h-4 mr-2" /> Add Grave
          </Button>
          <Button onClick={handleOpenExport} size="sm" variant="outline" className="text-primary border-primary hover:bg-primary/10">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
        </div>
      </div>
      <GraveList key={refreshGraves.toString()} onEdit={handleEdit} />
    </>
  );

  const UserView = () => (
    <Card className="shadow-medium">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle>User Management</CardTitle>
          <CardDescription>Manage registered users and admin roles</CardDescription>
        </div>
        <Button variant="outline" onClick={() => setCurrentView("graves")} size="sm">Back to Graves</Button>
      </CardHeader>
      <CardContent>
        {loadingUsers ? (
          <p className="text-center py-8 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading users...</p>
        ) : users.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground">No users found.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {users.map((user: any) => (
              <Card key={user.id} className="p-4 hover:shadow-lg transition-shadow border-l-4 border-l-primary/50">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-semibold text-lg">{user.full_name || user.email}</h4>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Shield className={`w-4 h-4 ${user.isAdmin ? "text-green-600" : "text-gray-400"}`} />
                      <span className="text-xs font-medium">{user.isAdmin ? "Administrator" : "Standard User"}</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={user.isAdmin ? "destructive" : "default"}
                    onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                  >
                    {user.isAdmin ? "Remove Admin" : "Make Admin"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const LotManagementView = () => {
    const filtered = lots.filter(lot =>
      lotFilter === "available" ? lot.is_available : lotFilter === "assigned" ? !lot.is_available : true
    );

    return (
      <Card className="shadow-medium">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Lot Management</CardTitle>
            <CardDescription>View, filter, and add cemetery lots</CardDescription>
          </div>
          <div className="flex gap-2">
            <Select value={lotFilter} onValueChange={(v) => setLotFilter(v as any)}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Lots ({lots.length})</SelectItem>
                <SelectItem value="available">Available ({lots.filter(l => l.is_available).length})</SelectItem>
                <SelectItem value="assigned">Assigned ({lots.filter(l => !l.is_available).length})</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddLot} size="sm">
              <Square className="w-4 h-4 mr-2" /> Add Lot
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLots ? (
            <p className="text-center py-8 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading lots...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No lots found</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((lot) => (
                <Card key={lot.id} className={`p-4 border-l-4 ${lot.is_available ? "border-l-green-500" : "border-l-red-500"} hover:shadow-lg transition-shadow`}>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-lg flex-1">{lot.display_name}</h4>
                    <div className="flex gap-1">
                      {lot.is_available && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                          onClick={() => {
                            setAssigningLotId(lot.id);
                            fetchGravesWithoutLots();
                          }}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
                      {!lot.is_available && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                          onClick={() => handleUnassignLotById(lot.id)}
                          title="Unassign grave from this lot"
                        >
                          <Unlink className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => handleEditLot(lot)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeletingLotId(lot.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <MapPin className={`w-4 h-4 ${lot.is_available ? "text-green-600" : "text-red-600"}`} />
                    <span className={`text-sm font-medium ${lot.is_available ? "text-green-600" : "text-red-600"}`}>
                      {lot.is_available ? "Available" : "Assigned"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">Block: {lot.block_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Location: {lot.centroid_lat.toFixed(4)}, {lot.centroid_lng.toFixed(4)}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const GraveFormView = () => (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle>{editingGrave ? "Edit Grave" : "Add New Grave"}</CardTitle>
      </CardHeader>
      <CardContent>
        <GraveForm grave={editingGrave} onClose={handleFormClose} />
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100" />
        <div className="text-center relative z-10">
          <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Leaf className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)`,
          backgroundSize: "50px 50px",
        }} />
      </div>

      <header className="bg-card shadow-soft border-b relative z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-primary rounded-full flex items-center justify-center">
              <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
            </div>
            <div className="leading-tight">
              <h1 className="text-xl sm:text-2xl font-serif font-bold">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">Sapian Cemetery Management</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => navigate("/")} variant="outline" size="sm" className="hover:bg-[#5D866C] hover:text-white border border-primary/40">
              View Map
            </Button>
            <Button onClick={handleLogout} variant="outline" size="sm" className="hover:bg-[#5D866C] hover:text-white border border-primary/40">
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 relative z-10">
        {showLotDrawing && (
          <LotDrawingMap 
            onCancel={() => {
              setShowLotDrawing(false);
              setEditingLot(null);
            }} 
            onSave={handleLotSaved} 
            isSaving={isSavingLot}
            editingLot={editingLot}
          />
        )}

        <div className="mb-6 flex flex-wrap gap-2 border-b pb-2">
          <Button variant={currentView === "graves" ? "default" : "ghost"} onClick={() => setCurrentView("graves")} size="sm">
            <GanttChart className="w-4 h-4 mr-2" /> Graves
          </Button>
          <Button variant={currentView === "lots" ? "default" : "ghost"} onClick={() => setCurrentView("lots")} size="sm">
            <Square className="w-4 h-4 mr-2" /> Lots
          </Button>
          <Button variant={currentView === "users" ? "default" : "ghost"} onClick={() => setCurrentView("users")} size="sm">
            <Users className="w-4 h-4 mr-2" /> Users
          </Button>
        </div>

        {currentView === "form" && <GraveFormView />}
        {currentView === "users" && <UserView />}
        {currentView === "lots" && <LotManagementView />}
        {currentView === "graves" && <GraveView />}
      </main>

      {/* Delete Lot Dialog */}
      <AlertDialog open={!!deletingLotId} onOpenChange={() => setDeletingLotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lot?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the lot from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingLotId && handleDeleteLot(deletingLotId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Lot Dialog */}
      {assigningLotId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">Assign Lot to Grave</h3>
              <p className="text-sm text-muted-foreground mt-1">Select a grave without an assigned lot</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingGravesForAssign ? (
                <p className="text-center py-8 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading graves...
                </p>
              ) : gravesWithoutLots.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No graves available for assignment</p>
              ) : (
                <div className="space-y-3">
                  {gravesWithoutLots.map((grave) => (
                    <Card key={grave.id} className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-gray-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{grave.grave_name}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {grave.date_of_death ? `d. ${new Date(grave.date_of_death).toLocaleDateString()}` : "No DOD"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Lat: {grave.latitude?.toFixed(4)}, Lng: {grave.longitude?.toFixed(4)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAssignLot(assigningLotId, grave.id)}
                          className="bg-primary hover:bg-primary/90 text-white"
                        >
                          Assign
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t p-4 flex justify-end">
              <Button variant="outline" onClick={() => setAssigningLotId(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {exportDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-lg max-w-6xl max-h-[90vh] w-full flex flex-col overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-bold">Export Graves</h3>
              <p className="text-sm text-muted-foreground">Select graves to export. Leave empty to export all.</p>
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-4 border-b flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by grave name..." value={searchExport} onChange={(e) => setSearchExport(e.target.value)} />
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {filteredExportGraves.length === 0 ? (
                  <p className="text-center py-12 text-muted-foreground">No graves found</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredExportGraves.map((grave) => (
                      <Card key={grave.id} className="p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start gap-3">
                          <Checkbox checked={selectedGravesForExport.has(grave.id)} onCheckedChange={() => toggleGraveForExport(grave.id)} />
                          <div>
                            <h4 className="font-bold">{grave.grave_name}</h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {grave.date_of_death ? new Date(grave.date_of_death).toLocaleDateString() : "No DOD"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {grave.latitude?.toFixed(4)}, {grave.longitude?.toFixed(4)}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t p-4 flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {filteredExportGraves.length} graves | Selected: {selectedGravesForExport.size}
                </p>
                <div className="flex items-center gap-3">
                  <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="pdf">PDF</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={handleExportGraves}>
                    Export {selectedGravesForExport.size || "All"} as {exportFormat.toUpperCase()}
                  </Button>
                  <Button variant="outline" onClick={() => setExportDialogOpen(false)}>Close</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;