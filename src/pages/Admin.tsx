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
  const [refreshGraves, setRefreshGraves] = useState(false);

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
      setUsers(data || []);
    } catch (error: any) {
      toast({ title: "Failed to load users", description: error.message, variant: "destructive" });
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleToggleAdmin = async (userId: string, isCurrentlyAdmin: boolean) => {
    try {
      if (isCurrentlyAdmin) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
        toast({ title: "Admin role removed successfully." });
      } else {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error) throw error;
        toast({ title: "Admin role assigned successfully." });
      }
      fetchUsers();
    } catch (error: any) {
      toast({ title: "Error updating role", description: error.message, variant: "destructive" });
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
    setRefreshGraves(!refreshGraves);
  };

  const handleExport = async (format: "json" | "csv" | "pdf") => {
    const { data, error } = await supabase.from("graves").select("*").order("grave_name");
    if (error) return toast({ title: "Export Failed", description: error.message, variant: "destructive" });
    if (!data || data.length === 0) return toast({ title: "No Data", description: "No grave records to export." });

    if (format === "json") {
      saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), "graves.json");
    } else if (format === "csv") {
      const headers = Object.keys(data[0]);
      const csv = [headers.join(","), ...data.map(row => headers.map(h => `"${row[h]}"`).join(","))].join("\n");
      saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), "graves.csv");
    } else if (format === "pdf") {
      const doc = new jsPDF();
      data.forEach((row, i) => doc.text(`${i + 1}. ${row.grave_name} - ${row.latitude}, ${row.longitude}`, 10, 10 + i * 10));
      doc.save("graves.pdf");
    }
    setExportOpen(false);
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !importType) return;

    try {
      const text = await file.text();
      let data: any[] = [];

      if (importType === "json") data = JSON.parse(text);
      if (importType === "csv") {
        const [headerLine, ...lines] = text.split("\n").filter(Boolean);
        const headers = headerLine.split(",");
        const requiredHeaders = ["grave_name"];
        const missing = requiredHeaders.filter(h => !headers.includes(h));
        if (missing.length > 0) throw new Error(`CSV is missing required headers: ${missing.join(",")}`);
        data = lines.map(line => {
          const values = line.split(",");
          const obj: any = {};
          headers.forEach((h, i) => { obj[h.trim()] = values[i]?.trim() || null; });
          return obj;
        });
      }

      const processedData = data.map(row => ({
        grave_name: row.grave_name || "",
        latitude: row.latitude ? parseFloat(row.latitude) : DEFAULT_LAT,
        longitude: row.longitude ? parseFloat(row.longitude) : DEFAULT_LNG,
        grave_image_url: row.grave_image_url || null,
        date_of_birth: row.date_of_birth || null,
        date_of_death: row.date_of_death || null,
        additional_info: row.additional_info || null,
      }));

      const { error } = await supabase.from("graves").insert(processedData);
      if (error) throw error;
      toast({ title: "Data Imported", description: `${processedData.length} grave records imported successfully.` });
      setRefreshGraves(!refreshGraves);
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
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100" />
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

      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        <div className="absolute inset-0 opacity-5" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)`,
          backgroundSize: "50px 50px",
        }} />
      </div>

      {/* Header */}
      <header className="bg-card shadow-soft border-b relative z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

          {/* Left Title Section */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-primary rounded-full flex items-center justify-center">
              <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
            </div>

            <div className="leading-tight">
              <h1 className="text-xl sm:text-2xl font-serif font-bold">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Sapian Cemetery Management
              </p>
            </div>
          </div>

          {/* Right Buttons Section — UPDATED */}
          <div className="flex items-center space-x-2 justify-end">
            <Button
              onClick={() => navigate("/")}
              variant="outline"
              size="sm"
              className="hover:bg-[#5D866C] hover:text-white border border-primary/40 flex items-center"
            >
              View Map
            </Button>

            <Button
              onClick={handleLogout}
              variant="outline"
              size="sm"
              className="hover:bg-[#5D866C] hover:text-white border border-primary/40 flex items-center"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8 relative z-10">
        {showForm ? (
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>{editingGrave ? "Edit Grave" : "Add New Grave"}</CardTitle>
              <CardDescription>{editingGrave ? "Update grave information" : "Add a new grave to the cemetery database"}</CardDescription>
            </CardHeader>
            <CardContent>
              <GraveForm grave={editingGrave} onClose={handleFormClose} />
            </CardContent>
          </Card>
        ) : showUsers ? (
          <Card className="shadow-medium">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base sm:text-lg">User Management</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Manage user roles for the cemetery system</CardDescription>
              </div>
              <Button variant="outline" onClick={() => setShowUsers(false)} size="sm"
                className="hover:bg-[#5D866C] hover:text-white border border-primary/40 flex items-center"
              >
                Back to Graves
              </Button>
            </CardHeader>
            <CardContent>
              {loadingUsers ? (
                <p className="text-center text-muted-foreground">Loading users...</p>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {users.length === 0 ? (
                    <p className="text-center text-muted-foreground">No users found.</p>
                  ) : (
                    users.map((user: any) => (
                      <div
                        key={user.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 border rounded-lg bg-card/50 gap-2 sm:gap-0"
                      >
                        <div className="space-y-1 min-w-0">
                          <p className="font-medium text-sm sm:text-base truncate">{user.full_name || user.email}</p>
                          <p className="text-xs sm:text-sm text-muted-foreground truncate">{user.email}</p>
                          <p className="text-xs text-muted-foreground">Role: {user.isAdmin ? "Admin" : "User"}</p>
                        </div>
                        <Button
                          variant={user.isAdmin ? "destructive" : "default"}
                          size="sm"
                          onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                          className="w-full sm:w-auto"
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
            <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
              <div className="space-y-1">
                <h2 className="text-xl sm:text-2xl font-serif font-bold mb-0">Grave Records</h2>
                <p className="text-sm sm:text-base text-muted-foreground">Manage cemetery grave locations and information</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-start sm:justify-end">
                <Button onClick={() => setShowForm(true)} size="sm" className="shadow-soft flex-1 sm:flex-none min-w-0">
                  <Plus className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Add Grave
                </Button>
                <Button onClick={() => setShowUsers(true)} size="sm" className="shadow-soft flex-1 sm:flex-none min-w-0">
                  <Users className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> Users
                </Button>

                {/* Export Data Dropdown */}
                <div className="relative flex-1 sm:flex-none min-w-0">
                  <Button onClick={() => setExportOpen(!exportOpen)} size="sm" className="shadow-soft flex items-center justify-center w-full min-w-0 px-2 sm:px-3">
                    <Download className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Export</span> <span className="sm:hidden">Data</span> <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 ml-0 sm:ml-1" />
                  </Button>
                  {exportOpen && (
                    <div className="absolute right-0 mt-1 sm:mt-2 w-32 sm:w-40 bg-card border rounded-md shadow-lg z-50">
                      <Button variant="ghost" className="w-full justify-start px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm" onClick={() => handleExport("json")}>JSON</Button>
                      <Button variant="ghost" className="w-full justify-start px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm" onClick={() => handleExport("csv")}>CSV</Button>
                      <Button variant="ghost" className="w-full justify-start px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm" onClick={() => handleExport("pdf")}>PDF</Button>
                    </div>
                  )}
                </div>

                {/* Import Data Dropdown */}
                <div className="relative flex-1 sm:flex-none min-w-0">
                  <Button onClick={() => setImportOpen(!importOpen)} size="sm" className="shadow-soft flex items-center justify-center w-full min-w-0 px-2 sm:px-3">
                    <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Import</span> <span className="sm:hidden">Data</span> <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 ml-0 sm:ml-1" />
                  </Button>
                  {importOpen && (
                    <div className="absolute right-0 mt-1 sm:mt-2 w-32 sm:w-40 bg-card border rounded-md shadow-lg z-50">
                      <Button variant="ghost" className="w-full justify-start px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
                        onClick={() => { setImportType("json"); importInputRef.current?.click(); }}>
                        JSON
                      </Button>
                      <Button variant="ghost" className="w-full justify-start px-2 sm:px-4 py-1 sm:py-2 text-xs sm:text-sm"
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
