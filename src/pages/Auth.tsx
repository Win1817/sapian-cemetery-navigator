// src/pages/Auth.tsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Separate state for Sign In and Sign Up
  const [signInData, setSignInData] = useState({ email: "", password: "" });
  const [signUpData, setSignUpData] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    phone: "",
  });

  // Check session on mount
  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session) {
        navigate("/");
      }
    };
    checkSession();
    return () => { mounted = false; };
  }, [navigate]);

  // Sign In handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: signInData.email,
      password: signInData.password,
    });
    setLoading(false);
    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/");
    }
  };

  // Sign Up handler
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { email, password, firstName, lastName, phone } = signUpData;

    // Sign up user in Supabase Auth
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { first_name: firstName, last_name: lastName, phone_number: phone },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });

    setLoading(false);

    if (signUpError) {
      toast({
        title: "Sign up failed",
        description: signUpError.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Account created!",
        description: "You can now sign in with your credentials.",
      });
      // Reset fields or switch to Sign In tab if needed
      setSignUpData({ email: "", password: "", firstName: "", lastName: "", phone: "" });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-100">
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.1) 1px, transparent 0)`,
              backgroundSize: "50px 50px",
            }}
          />
        </div>
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

      {/* Card */}
      <Card className="w-full max-w-md relative z-10 shadow-xl bg-white/90 backdrop-blur-sm border-0">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center">
              <Leaf className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-3xl font-serif text-gray-800">Sapian Cemetery</CardTitle>
          <CardDescription className="text-gray-600">Navigation & Grave Locator</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6 rounded-lg bg-gray-100">
              <TabsTrigger
                value="signin"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm"
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger
                value="signup"
                className="data-[state=active]:bg-white data-[state=active]:text-emerald-600 data-[state=active]:shadow-sm"
              >
                Sign Up
              </TabsTrigger>
            </TabsList>

            {/* Sign In */}
            <TabsContent value="signin" className="mt-0">
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="text-sm font-medium text-gray-700">
                    Email Address
                  </Label>
                  <Input
                    id="signin-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signInData.email}
                    onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password" className="text-sm font-medium text-gray-700">
                    Password
                  </Label>
                  <Input
                    id="signin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={signInData.password}
                    onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium shadow-md transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign In"}
                </Button>
              </form>
            </TabsContent>

            {/* Sign Up */}
            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-firstname" className="text-sm font-medium text-gray-700">First Name</Label>
                  <Input
                    id="signup-firstname"
                    type="text"
                    placeholder="First Name"
                    value={signUpData.firstName}
                    onChange={(e) => setSignUpData({ ...signUpData, firstName: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-lastname" className="text-sm font-medium text-gray-700">Last Name</Label>
                  <Input
                    id="signup-lastname"
                    type="text"
                    placeholder="Last Name"
                    value={signUpData.lastName}
                    onChange={(e) => setSignUpData({ ...signUpData, lastName: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-phone" className="text-sm font-medium text-gray-700">Phone Number</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    placeholder="Phone Number"
                    value={signUpData.phone}
                    onChange={(e) => setSignUpData({ ...signUpData, phone: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="text-sm font-medium text-gray-700">Email Address</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    value={signUpData.email}
                    onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password" className="text-sm font-medium text-gray-700">Password (min 6 chars)</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    placeholder="Create password"
                    value={signUpData.password}
                    onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    className="h-11 border-gray-200 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                    minLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium shadow-md transition-all duration-200"
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Sign Up"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
