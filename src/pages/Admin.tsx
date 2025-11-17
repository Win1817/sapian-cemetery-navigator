// src/pages/Admin.tsx
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Leaf, LogOut, Plus, Download, Upload, ChevronDown, Users } from "lucide-react";
import { GraveList } from "@/components/admin/GraveList";
import { GraveForm } from "@/components/admin/GraveForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";
const DEFAULT_LAT = 11.494580675546114;
const DEFAULT_LNG = 122.60993819946555;

/*
To enable user management, create this RPC function in Supabase SQL Editor:

CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  is_admin boolean;
BEGIN
  -- Check if current user is admin
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') INTO is_admin;
  IF NOT is_admin THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
  END IF;

  -- Return array of users with admin status
  RETURN (
    SELECT json_agg(
      json_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', COALESCE(u.raw_user_meta_data->>'full_name', null),
        'isAdmin', EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin')
      )
    )
    FROM auth.users u
  );
END;
$$;

Note: Enable RLS on auth.users if needed, but SECURITY DEFINER bypasses it.
Also, ensure the function owner has necessary privileges.
*/

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [editingGrave, setEditingGrave] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importType, setImportType] = useState<"json" | "csv" | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [refreshGraves, setRefreshGraves] = useState(false); // trigger list refresh
  useEffect(() => {
    checkAdminStatus();
  }, []);
  useEffect(() => {
    if (showUsers && users.length === 0) {
      fetchUsers();
    }
  }, [showUsers]);
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
      toast({
        title: "Access denied",
        description: "You don't have admin privileges.",
        variant: "destructive",
      });
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
      if (!data) {
        setUsers([]);
        return;
      }
      // data is json array, parse if needed, but rpc returns array directly? Wait, since returns json, but supabase.rpc returns the return type.
      // Actually, for json return, it's string? No, supabase handles it as array/object.
      setUsers(data || []);
    } catch (error: any) {
      toast({
        title: "Failed to load users",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingUsers(false);
    }
  };
  const handleToggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    try {
      if (isCurrentlyAdmin) {
        // Remove admin role
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .eq("role", "admin");
        if (error) throw error;
        toast({ title: "Admin role removed successfully." });
      } else {
        // Assign admin role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: "admin" });
        if (error) throw error;
        toast({ title: "Admin role assigned successfully." });
      }
      // Refresh the users list
      fetchUsers();
    } catch (error: any) {
      toast({
        title: "Error updating role",
        description: error.message,
        variant: "destructive",
      });
    }
  };
  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };
  const handleEdit = (grave: any) => {
    setEditingGrave(grave);
    setShowForm(true);
  };
  const handleFormClose = () => {
    setShowForm(false);
    setEditingGrave(null);
    setRefreshGraves(!refreshGraves); // refresh list after form close
  };
  // ------------------- Export Data -------------------
  const handleExport = async (format: "json" | "csv" | "pdf") => {
    const { data, error } = await supabase.from("graves").select("*").order("grave_name");
    if (error) return toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    if (!data || data.length === 0) return toast({ title: "No Data", description: "No grave records to export." });
    if (format === "json") {
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "graves.json");
    } else if (format === "csv") {
      const headers = Object.keys(data[0]);
      const csv = [headers.join(","), ...data.map((row) => headers.map((h) => `"${row[h]}"`).join(","))].join("\n");
      saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), "graves.csv");
    } else if (format === "pdf") {
      const doc = new jsPDF();
      data.forEach((row, i) => {
        doc.text(`${i + 1}. ${row.grave_name} - ${row.latitude}, ${row.longitude}`, 10, 10 + i * 10);
      });
      doc.save("graves.pdf");
    }
    setExportOpen(false);
  };
  // ------------------- Import Data -------------------
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !importType) return;
    try {
      const text = await file.text();
      let data: any[] = [];
      if (importType === "json") {
        data = JSON.parse(text);
      } else if (importType === "csv") {
        const [headerLine, ...lines] = text.split("\n").filter(Boolean);
        const headers = headerLine.split(",");
        const requiredHeaders = ["grave_name"];
        const missing = requiredHeaders.filter((h) => !headers.includes(h));
        if (missing.length > 0) throw new Error(`CSV is missing required headers: ${missing.join(", ")}`);
        data = lines.map((line) => {
          const values = line.split(",");
          const obj: any = {};
          headers.forEach((h, i) => {
            obj[h.trim()] = values[i]?.trim() || null;
          });
          return obj;
        });
      }
      // process data: ignore empty fields and set defaults
      const processedData = data.map((row: any) => ({
        grave_name: row.grave_name || "",
        latitude: row.latitude ? parseFloat(row.latitude) : DEFAULT_LAT,
        longitude: row.longitude ? parseFloat(row.longitude) : DEFAULT_LNG,
        grave_image_url: row.grave_image_url || null,
        date_of_birth: row.date_of_birth || null,
        date_of_death: row.date_of_death || null,
        additional_info: row.additional_info || null,
      }));
      // insert data into Supabase
      const { error } = await supabase.from("graves").insert(processedData);
      if (error) throw error;
      toast({ title: "Data Imported", description: `${processedData.length} grave records imported successfully.` });
      setRefreshGraves(!refreshGraves); // refresh grave list immediately
    } catch (err: any) {
      toast({ title: "Import Failed", description: err.message, variant: "destructive" });
    } finally {
      setImportOpen(false);
      setImportType(null);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        {/* Subtle overlay pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)`,
            backgroundSize: '50px 50px',
          }} />
        </div>
        {/* Floating leaf elements for theme */}
        <div className="absolute top-20 left-10 w-12 h-12 text-emerald-200 opacity-30 animate-pulse">
          <Leaf className="w-full h-full" />
        </div>
        <div className="absolute bottom-32 right-20 w-16 h-16 text-green-200 opacity-20 rotate-12">
          <Leaf className="w-full h-full" />
        </div>
        <div className="absolute top-1/2 left-1/4 w-8 h-8 text-teal-200 opacity-25 -rotate-6">
          <Leaf className="w-full h-full" />
        </div>
      </div>
      <div className="text-center relative z-10">
        <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
          <Leaf className="w-8 h-8 text-primary-foreground" />
        </div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Enhanced Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        {/* Subtle overlay pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)`,
            backgroundSize: '50px 50px',
          }} />
        </div>
        {/* Floating leaf elements for theme */}
        <div className="absolute top-20 left-10 w-12 h-12 text-emerald-200 opacity-30 animate-pulse">
          <Leaf className="w-full h-full" />
        </div>
        <div className="absolute bottom-32 right-20 w-16 h-16 text-green-200 opacity-20 rotate-12">
          <Leaf className="w-full h-full" />
        </div>
        <div className="absolute top-1/2 left-1/4 w-8 h-8 text-teal-200 opacity-25 -rotate-6">
          <Leaf className="w-full h-full" />
        </div>
      </div>
      {/* Header */}
      <header className="bg-card shadow-soft border-b relative z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-primary rounded-full flex items-center justify-center">
              <Leaf className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-bold">Admin Dashboard</h1>
              <p className="text-sm text-muted-foreground">Sapian Cemetery Management</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button onClick={() => navigate("/")} variant="outline" size="sm">View Map</Button>
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="w-4 h-4 mr-2" /> Logout
            </Button>
          </div>
        </div>
      </header>
      {/* Main */}
      <main className="container mx-auto px-4 py-8 relative z-10">
        {showForm ? (
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>{editingGrave ? "Edit Grave" : "Add New Grave"}</CardTitle>
              <CardDescription>
                {editingGrave ? "Update grave information" : "Add a new grave to the cemetery database"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GraveForm grave={editingGrave} onClose={handleFormClose} />
            </CardContent>
          </Card>
        ) : showUsers ? (
          <Card className="shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Manage user roles for the cemetery system</CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowUsers(false)}>
                Back to Graves
              </Button>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <p className="text-center text-muted-foreground">Loading users...</p>
              ) : (
                <div className="space-y-4">
                  {users.length === 0 ? (
                    <p className="text-center text-muted-foreground">No users found.</p>
                  ) : (
                    users.map((user: any) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-card/50"
                      >
                        <div className="space-y-1">
                          <p className="font-medium">{user.full_name || user.email}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                          <p className="text-xs text-muted-foreground">
                            Role: {user.isAdmin ? "Admin" : "User"}
                          </p>
                        </div>
                        <Button
                          variant={user.isAdmin ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                        >
                          {user.isAdmin ? "Remove Admin" : "Make Admin"}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Action Buttons */}
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-serif font-bold mb-1">Grave Records</h2>
                <p className="text-muted-foreground">Manage cemetery grave locations and information</p>
              </div>
              <div className="flex space-x-2">
                <Button onClick={() => setShowForm(true)} className="shadow-soft">
                  <Plus className="w-4 h-4 mr-2" /> Add Grave
                </Button>
                <Button onClick={() => setShowUsers(true)} className="shadow-soft">
                  <Users className="w-4 h-4 mr-2" /> Users
                </Button>
                {/* Export Data Dropdown */}
                <div className="relative">
                  <Button onClick={() => setExportOpen(!exportOpen)} className="shadow-soft flex items-center">
                    <Download className="w-4 h-4 mr-2" /> Export Data <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                  {exportOpen && (
                    <div className="absolute right-0 mt-2 w-40 bg-card border rounded-md shadow-lg z-50">
                      <Button variant="ghost" className="w-full justify-start px-4 py-2" onClick={() => handleExport("json")}>JSON</Button>
                      <Button variant="ghost" className="w-full justify-start px-4 py-2" onClick={() => handleExport("csv")}>CSV</Button>
                      <Button variant="ghost" className="w-full justify-start px-4 py-2" onClick={() => handleExport("pdf")}>PDF</Button>
                    </div>
                  )}
                </div>
                {/* Import Data Dropdown */}
                <div className="relative">
                  <Button onClick={() => setImportOpen(!importOpen)} className="shadow-soft flex items-center">
                    <Upload className="w-4 h-4 mr-2" /> Import Data <ChevronDown className="w-4 h-4 ml-1" />
                  </Button>
                  {importOpen && (
                    <div className="absolute right-0 mt-2 w-40 bg-card border rounded-md shadow-lg z-50">
                      <Button variant="ghost" className="w-full justify-start px-4 py-2"
                        onClick={() => { setImportType("json"); importInputRef.current?.click(); }}>
                        JSON
                      </Button>
                      <Button variant="ghost" className="w-full justify-start px-4 py-2"
                        onClick={() => { setImportType("csv"); importInputRef.current?.click(); }}>
                        CSV
                      </Button>
                    </div>
                  )}
                  <input type="file" ref={importInputRef} accept=".json,.csv,application/json,text/csv" onChange={handleImport} className="hidden" />
                </div>
              </div>
            </div>
            {/* Grave List */}
            <GraveList key={refreshGraves.toString()} onEdit={handleEdit} />
          </>
        )}
      </main>
    </div>
  );
};
export default Admin;
