import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useLogin, useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Zap, User, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);

  const { data: user, isLoading: isLoadingUser } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });
  const loginMutation = useLogin();

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  useEffect(() => {
    if (user && !isLoadingUser) setLocation("/dashboard");
  }, [user, isLoadingUser, setLocation]);

  function onSubmit(values: z.infer<typeof loginSchema>) {
    loginMutation.mutate({ data: values }, {
      onSuccess: () => setLocation("/dashboard"),
    });
  }

  const handleForgotPassword = () => {
    toast({
      title: "Reset Password Required",
      description: "Please contact your system administrator at admin@genops.com to reset your credentials.",
      variant: "default",
    });
  };

  if (isLoadingUser) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "#efebe4" }}>
      {/* Left branding panel */}
      <div className="hidden lg:flex flex-col justify-between w-100 p-12 shadow-2xl relative overflow-hidden" style={{ background: "linear-gradient(135deg, hsla(200, 8%, 7%, 1.00) 0%, #0C5179 100%)" }}>
        {/* Decorative subtle background shapes */}
        <div className="absolute top-[-20%] right-[-20%] w-80 h-80 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="absolute bottom-[-10%] left-[-10%] w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg shadow-orange-500/20" style={{ background: "#ff6c00" }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-black text-2xl tracking-tight">GenOps</span>
        </div>

        <div className="relative z-10 my-auto py-12">
          <h2 className="text-white text-4xl font-extrabold leading-tight mb-4 tracking-tight">
            Generator Management System<br />& Operations
          </h2>
          <p className="text-white text-sm leading-relaxed mb-8 max-w-sm">
            Track, manage, and monitor generator records in real-time. Every entry is automatically synced directly to your secure Google Sheet.
          </p>
        </div>

        <div className="text-slate-500 text-xs relative z-10">
          &copy; {new Date().getFullYear()} GenOps. All rights reserved.
          <br />Software Developed by <span className="text-orange-500 font-bold">Abhishek Prasad</span>
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-200/80 p-8 md:p-10 transition-all hover:shadow-2xl">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/10" style={{ background: "#ff6c00" }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-2xl tracking-tight" style={{ color: "#1f1f2e" }}>GenOps</span>
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight mb-1.5" style={{ color: "#1f1f2e" }}>Login</h1>
          <p className="text-sm mb-8 font-medium text-gray-505" style={{ color: "#6b7280" }}>Sign in to manage your genset assets</p>

          {loginMutation.isError && (
            <div className="mb-6 px-4.5 py-3.5 rounded-xl text-sm font-semibold transition-all shadow-sm flex items-center gap-2" style={{ background: "#fff1f0", color: "#cf1322", border: "1px solid #ffa39e" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              Invalid username or password
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-gray-700">Username</FormLabel>
                    <FormControl>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-orange-500">
                          <User className="w-4.5 h-4.5" />
                        </span>
                        <Input
                          placeholder="Enter your username"
                          className="pl-10 h-11 border-gray-300 focus:border-orange-500 focus:ring-orange-500 bg-white rounded-lg transition-all focus:shadow-sm"
                          data-testid="input-username"
                          {...field}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-sm font-semibold text-gray-700">Password</FormLabel>
                      <button
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700 hover:underline transition-colors cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <FormControl>
                      <div className="relative group">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-orange-500">
                          <Lock className="w-4.5 h-4.5" />
                        </span>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="pl-10 pr-10 h-11 border-gray-300 focus:border-orange-500 focus:ring-orange-500 bg-white rounded-lg transition-all focus:shadow-sm"
                          data-testid="input-password"
                          {...field}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none cursor-pointer"
                        >
                          {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full h-11 font-bold text-white rounded-lg transition-all shadow-md hover:shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20 active:scale-98 cursor-pointer text-sm"
                style={{ background: "#ff6c00" }}
                disabled={loginMutation.isPending}
                data-testid="button-login"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </Form>

          <p className="text-center text-sm mt-8 text-gray-500 font-medium">
            Don't have an account?{" "}
            <Link href="/register" className="font-bold hover:underline transition-colors" style={{ color: "#ff6c00" }}>
              Register here
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
