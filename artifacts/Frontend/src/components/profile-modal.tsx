import * as React from "react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDemoUsers,
  useCreateDemoUser,
  useUpdateDemoUser,
  useDeleteDemoUser,
  getListDemoUsersQueryKey,
  getGetMeQueryKey,
  User,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Trash2,
  Shield,
  UserPlus,
  Clock,
  Copy,
  CheckCircle2,
  Lock,
  UserCheck,
  Globe,
  Eye,
  Pencil,
  AlertTriangle,
  Users,
  User as UserIcon,
  TimerOff,
  Activity,
  BadgeCheck,
} from "lucide-react";

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User & { isDemoUser?: boolean; permissions?: string };
}

const DURATION_OPTIONS = [
  { value: "1h", label: "1 Hour" },
  { value: "5h", label: "5 Hours" },
  { value: "24h", label: "24 Hours" },
  { value: "1w", label: "1 Week" },
  { value: "1m", label: "1 Month" },
];

export function ProfileModal({ isOpen, onClose, user }: ProfileModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("profile");
  const [copied, setCopied] = useState(false);

  // Form states for creating a new demo user
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [newPermission, setNewPermission] = useState<"view" | "edit">("view");
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [duration, setDuration] = useState("24h");
  const [errorMsg, setErrorMsg] = useState("");

  const isAdmin = !user.isDemoUser;
  const { data: demoUsers, isLoading: isLoadingDemos } = useListDemoUsers({
    query: {
      enabled: isOpen && isAdmin,
      queryKey: getListDemoUsersQueryKey(),
    },
  });

  const createMutation = useCreateDemoUser();
  const updateMutation = useUpdateDemoUser();
  const deleteMutation = useDeleteDemoUser();

  const handleCopySheet = () => {
    if (user.sheetLink) {
      navigator.clipboard.writeText(user.sheetLink);
      setCopied(true);
      toast({ title: "Copied!", description: "Google Sheet link copied to clipboard." });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreateDemo = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const u = newUsername.trim();
    const p = newPassword.trim();
    if (!u || !p) { setErrorMsg("Username and password are required."); return; }
    if (p.length < 4) { setErrorMsg("Password must be at least 4 characters."); return; }

    createMutation.mutate(
      { data: { username: u, password: p, permissions: newPermission, isActive: true, duration: isUnlimited ? "none" : duration } },
      {
        onSuccess: () => {
          toast({ title: "✅ Account created", description: `"${u}" guest account is ready.` });
          setNewUsername(""); setNewPassword(""); setNewPermission("view");
          setIsUnlimited(false); setDuration("24h");
          queryClient.invalidateQueries({ queryKey: getListDemoUsersQueryKey() });
        },
        onError: (err: any) => {
          const msg = err?.data?.error || err?.message || "Failed to create demo user.";
          setErrorMsg(msg);
        },
      }
    );
  };

  const handleToggleActive = (demoId: number, currentActive: boolean) => {
    updateMutation.mutate(
      { id: demoId, data: { isActive: !currentActive } },
      {
        onSuccess: (updated) => {
          toast({
            title: updated.isActive ? "Account Activated" : "Account Deactivated",
            description: `Demo account is now ${updated.isActive ? "active" : "inactive"}.`,
          });
          queryClient.invalidateQueries({ queryKey: getListDemoUsersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to update.", variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteDemo = (demoId: number, username: string) => {
    if (!window.confirm(`Delete guest account "${username}"? This cannot be undone.`)) return;
    deleteMutation.mutate(
      { id: demoId },
      {
        onSuccess: () => {
          toast({ title: "Deleted", description: `"${username}" has been removed.` });
          queryClient.invalidateQueries({ queryKey: getListDemoUsersQueryKey() });
        },
        onError: (err: any) => {
          toast({ title: "Error", description: err?.data?.error || "Failed to delete.", variant: "destructive" });
        },
      }
    );
  };

  const formatRemainingTime = (expiresAtStr: string | null | undefined) => {
    if (!expiresAtStr) return "No expiry";
    const diff = new Date(expiresAtStr).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h left`;
    return `${Math.floor(hrs / 24)}d left`;
  };

  const getStatusInfo = (isActive: boolean, expiresAtStr: string | null | undefined) => {
    const expired = expiresAtStr && new Date(expiresAtStr) < new Date();
    if (!isActive) return { label: "Inactive", color: "#6b7280", bg: "#f3f4f6", dot: "#9ca3af" };
    if (expired) return { label: "Expired", color: "#dc2626", bg: "#fef2f2", dot: "#ef4444" };
    return { label: "Active", color: "#16a34a", bg: "#f0fdf4", dot: "#22c55e" };
  };

  const activeCount = demoUsers?.filter(u => u.isActive && !(u.expiresAt && new Date(u.expiresAt) < new Date())).length ?? 0;
  const totalCount = demoUsers?.length ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl w-[96vw] p-0 overflow-hidden bg-white border border-gray-100 shadow-2xl rounded-2xl">

        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 bg-gradient-to-br from-orange-50 via-white to-orange-50/30 border-b border-orange-100/60">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-gray-900 leading-tight">Profile & Security</DialogTitle>
              <DialogDescription className="text-xs text-gray-400 mt-0.5">
                Manage your account and secure guest access credentials
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-5 bg-gray-100/80 p-1 rounded-xl h-10">
              <TabsTrigger
                value="profile"
                className="text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-500 flex items-center gap-1.5"
              >
                <UserIcon className="w-3.5 h-3.5" />
                My Account
              </TabsTrigger>
              <TabsTrigger
                value="demo"
                className="text-sm font-semibold rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-500 flex items-center gap-1.5"
                disabled={!isAdmin}
              >
                <Users className="w-3.5 h-3.5" />
                Guest Accounts
                {isAdmin && totalCount > 0 && (
                  <span className="ml-1 px-1.5 py-px text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">
                    {totalCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* ── Profile Tab ── */}
            <TabsContent value="profile" className="space-y-4 focus:outline-none">
              {/* Avatar + name */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-r from-orange-50/80 to-transparent border border-orange-100/50">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center font-bold text-white text-xl shadow-md shadow-orange-400/30 flex-shrink-0">
                  {user.username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-gray-900 truncate">{user.username}</h3>
                    {user.isDemoUser ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100">
                        <Eye className="w-2.5 h-2.5" /> Guest
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-orange-500 text-white shadow-sm">
                        <BadgeCheck className="w-2.5 h-2.5" /> Admin
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">{user.email}</p>
                </div>
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/60">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Username</span>
                  <p className="font-bold text-gray-800 mt-1 flex items-center gap-1.5 text-sm">
                    <UserCheck className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    {user.username}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/60">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Email</span>
                  <p className="font-bold text-gray-800 mt-1 flex items-center gap-1.5 text-sm truncate">
                    <Globe className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </p>
                </div>
              </div>

              {/* Sheet link */}
              <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/60">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Google Sheet Link</span>
                  <button
                    onClick={handleCopySheet}
                    className="text-[11px] text-orange-500 font-semibold flex items-center gap-1 hover:text-orange-600 transition-colors"
                  >
                    {copied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 font-mono break-all border border-gray-200/80 bg-white p-2.5 rounded-lg leading-relaxed">
                  {user.sheetLink || "No sheet linked."}
                </p>
              </div>

              {/* Demo user info banner */}
              {user.isDemoUser && (
                <div className="p-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-blue-50/30 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                    {user.permissions === "edit"
                      ? <Pencil className="w-4 h-4 text-blue-600" />
                      : <Eye className="w-4 h-4 text-blue-600" />
                    }
                  </div>
                  <div>
                    <h5 className="text-sm font-bold text-blue-900">
                      {user.permissions === "edit" ? "Read & Write Access" : "View-Only Access"}
                    </h5>
                    <p className="text-xs text-blue-600/80 mt-0.5 leading-relaxed">
                      You are signed in as a guest. {user.permissions === "edit"
                        ? "You can view and edit generator records."
                        : "You can view records but cannot add, edit, or delete them."}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Demo Accounts Tab ── */}
            {isAdmin && (
              <TabsContent value="demo" className="focus:outline-none">
                <div className="flex flex-col md:flex-row gap-5">

                  {/* Left: Create Form */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
                      <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
                        <UserPlus className="w-3.5 h-3.5 text-orange-500" />
                      </div>
                      <h4 className="text-sm font-bold text-gray-800">New Guest Account</h4>
                    </div>

                    {demoUsers && demoUsers.length >= 5 ? (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-500" />
                        <div>
                          <p className="text-xs font-bold">Slot limit reached (5/5)</p>
                          <p className="text-xs mt-0.5 text-amber-700">Delete an existing account to free up a slot.</p>
                        </div>
                      </div>
                    ) : (
                      <form onSubmit={handleCreateDemo} className="space-y-3.5">
                        {/* Error */}
                        {errorMsg && (
                          <div className="p-3 text-xs bg-red-50 text-red-600 border border-red-100 rounded-xl flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-500" />
                            <span>{errorMsg}</span>
                          </div>
                        )}

                        {/* Username */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-gray-600">Username</Label>
                          <Input
                            placeholder="e.g. viewer_john"
                            value={newUsername}
                            onChange={(e) => { setNewUsername(e.target.value); setErrorMsg(""); }}
                            className="h-9 text-sm bg-gray-50 border-gray-200 focus-visible:ring-orange-400/40"
                          />
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                          <Label className="text-xs font-bold text-gray-600">Password</Label>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Min. 4 characters"
                              value={newPassword}
                              onChange={(e) => { setNewPassword(e.target.value); setErrorMsg(""); }}
                              className="h-9 text-sm bg-gray-50 border-gray-200 focus-visible:ring-orange-400/40 pr-9"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(v => !v)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Permission + Duration row */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-gray-600">Permission</Label>
                            <Select value={newPermission} onValueChange={(v: "view" | "edit") => setNewPermission(v)}>
                              <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="view">
                                  <span className="flex items-center gap-1.5"><Eye className="w-3 h-3 text-blue-500" /> View Only</span>
                                </SelectItem>
                                <SelectItem value="edit">
                                  <span className="flex items-center gap-1.5"><Pencil className="w-3 h-3 text-purple-500" /> Read & Write</span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-gray-600">Expires In</Label>
                            <Select disabled={isUnlimited} value={duration} onValueChange={setDuration}>
                              <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {DURATION_OPTIONS.map(o => (
                                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Unlimited toggle */}
                        <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200/60 bg-gray-50/60">
                          <div>
                            <p className="text-xs font-bold text-gray-700">No expiry</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Active until manually disabled</p>
                          </div>
                          <Switch id="unlimited" checked={isUnlimited} onCheckedChange={setIsUnlimited} />
                        </div>

                        <Button
                          type="submit"
                          disabled={createMutation.isPending}
                          className="w-full h-9 font-bold text-sm text-white rounded-xl shadow-sm shadow-orange-500/20 transition-all hover:shadow-md hover:shadow-orange-500/30"
                          style={{ background: createMutation.isPending ? "#f97316" : "#ff6c00" }}
                        >
                          {createMutation.isPending ? (
                            <span className="flex items-center gap-2">
                              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              Creating...
                            </span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <UserPlus className="w-3.5 h-3.5" />
                              Create Guest Account
                            </span>
                          )}
                        </Button>
                      </form>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="hidden md:block w-px bg-gray-100 self-stretch mx-1" />

                  {/* Right: List */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                          <Lock className="w-3.5 h-3.5 text-gray-500" />
                        </div>
                        <h4 className="text-sm font-bold text-gray-800">Guest Profiles</h4>
                      </div>
                      {demoUsers && (
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                          <span className="text-[10px] font-bold text-gray-500">
                            {activeCount} active · {totalCount}/5 slots
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5">
                      {isLoadingDemos ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-5 h-5 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mb-2" />
                          <p className="text-xs text-gray-400">Loading accounts...</p>
                        </div>
                      ) : demoUsers && demoUsers.length > 0 ? (
                        demoUsers.map((u) => {
                          const status = getStatusInfo(u.isActive, u.expiresAt);
                          return (
                            <div
                              key={u.id}
                              className="group p-3.5 rounded-xl border border-gray-200/80 bg-white hover:border-gray-300 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-start justify-between gap-2">
                                {/* Info */}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-gray-900">{u.username}</span>
                                    {/* Status badge */}
                                    <span
                                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                                      style={{ background: status.bg, color: status.color }}
                                    >
                                      <span className="w-1 h-1 rounded-full" style={{ background: status.dot }} />
                                      {status.label}
                                    </span>
                                    {/* Permission badge */}
                                    <span
                                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        u.permissions === "edit"
                                          ? "bg-purple-50 text-purple-700"
                                          : "bg-blue-50 text-blue-700"
                                      }`}
                                    >
                                      {u.permissions === "edit"
                                        ? <><Pencil className="w-2 h-2" /> Write</>
                                        : <><Eye className="w-2 h-2" /> View</>
                                      }
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-gray-400">
                                    {u.expiresAt ? (
                                      <>
                                        <Clock className="w-2.5 h-2.5" />
                                        <span>{formatRemainingTime(u.expiresAt)}</span>
                                      </>
                                    ) : (
                                      <>
                                        <TimerOff className="w-2.5 h-2.5" />
                                        <span>No expiry set</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <Activity className="w-3 h-3 text-gray-300" />
                                    <Switch
                                      checked={u.isActive}
                                      onCheckedChange={() => handleToggleActive(u.id, u.isActive)}
                                      title={u.isActive ? "Deactivate" : "Activate"}
                                    />
                                  </div>
                                  <button
                                    onClick={() => handleDeleteDemo(u.id, u.username)}
                                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete account"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50">
                          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                            <Users className="w-5 h-5 text-gray-300" />
                          </div>
                          <p className="text-xs font-semibold text-gray-400">No guest accounts yet</p>
                          <p className="text-[10px] text-gray-300 mt-1 max-w-[180px]">
                            Create up to 5 secure guest credentials with view or edit access.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
