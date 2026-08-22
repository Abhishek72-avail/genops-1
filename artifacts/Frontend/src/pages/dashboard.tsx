import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe, getGetMeQueryKey,
  useLogout,
  useListGenerators, getListGeneratorsQueryKey,
  useGetGeneratorStats, getGetGeneratorStatsQueryKey,
  useCreateGenerator, useUpdateGenerator, useDeleteGenerator,
  useUpdateMe,
} from "@workspace/api-client-react";
import type { GeneratorRecord } from "@workspace/api-client-react";
import {
  Zap, LogOut, Plus, Search, Edit2, Trash2,
  TrendingUp, Database, X, ChevronDown, Truck,
  ExternalLink, RefreshCw, Lock, Eye, EyeOff,
  Download, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ProfileModal } from "@/components/profile-modal";
import { useToast } from "@/hooks/use-toast";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const formSchema = z.object({
  tDate: z.string().min(1, "Date is required"),
  generatorId: z.string().min(1, "Generator ID is required"),
  status: z.string().min(1, "Status is required"),
  rating: z.string().optional().nullable(),
  hours: z.coerce.number().optional().nullable(),
  remarks: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

const STATUS_CONFIG: Record<string, { bg: string; text: string; dot: string }> = {
  "Ready": { bg: "#ffffffff", text: "#228B22", dot: "	#228B22" },
  "Used Ready": { bg: "#ffffffff", text: "#FBC02D", dot: "#FBC02D" },
  "Under Repair": { bg: "#ffffffff", text: "#FF0000", dot: "#FF0000" },
  "Under Readiness": { bg: "#ffffffff", text: "#174bd8ff", dot: "#174bd8ff" },
  "On-Site": { bg: "#ffffffff", text: "#BA68C8", dot: "#BA68C8" },
  "Other": { bg: "#ffffffff", text: "#64748b", dot: "#64748b" },
};

const STATUSES = ["Ready", "Used Ready", "Under Repair", "Under Readiness", "On-Site", "Other"];

interface CPanelConfig {
  id: string;
  label: string;
  prefixes: string[];
  isCustom?: boolean;
}

const DEFAULT_CPANELS: CPanelConfig[] = [];

function getGeneratorPanel(generatorId: string, panels: CPanelConfig[]): string {
  const id = (generatorId || "").toUpperCase().trim();
  for (const panel of panels) {
    for (const prefix of panel.prefixes) {
      if (id.startsWith(prefix.toUpperCase().trim())) {
        return panel.id;
      }
    }
  }
  return "Other";
}


function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG["On-Site"];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
      style={{ background: cfg.bg, color: cfg.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {status}
    </span>
  );
}

function StatCard({
  icon, label, value, accent, onClick, isActive,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: string;
  onClick?: () => void;
  isActive?: boolean;
}) {
  const color = accent ?? "#ff6c00";
  return (
    <div
      className={`bg-white rounded-xl border p-5 flex items-center gap-4 shadow-sm transition-all ${onClick ? "cursor-pointer hover:shadow-md" : ""}`}
      style={{
        borderColor: isActive ? color : "#e5e7eb",
        boxShadow: isActive ? `0 0 0 2px ${color}33` : undefined,
      }}
      onClick={onClick}
    >
      <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "#9ca3af" }}>{label}</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color: "#111827" }}>{value}</p>
      </div>
      {onClick && (
        <ChevronDown
          className="w-4 h-4 transition-transform duration-200 flex-shrink-0"
          style={{ color: "#9ca3af", transform: isActive ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      )}
    </div>
  );
}

const TODAY = new Date().toISOString().split("T")[0];

function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}-${month}-${year}`;
  }
  return dateStr;
}

interface FormattedRemarks {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

function parseRemarks(remarksStr: string | null | undefined): FormattedRemarks {
  if (!remarksStr) return { text: "", bold: false, italic: false, underline: false, color: "" };
  try {
    if (remarksStr.startsWith("{") && remarksStr.endsWith("}")) {
      const parsed = JSON.parse(remarksStr);
      if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
        return {
          text: parsed.text || "",
          bold: !!parsed.bold,
          italic: !!parsed.italic,
          underline: !!parsed.underline,
          color: parsed.color || "",
        };
      }
    }
  } catch (e) { }
  return { text: remarksStr, bold: false, italic: false, underline: false, color: "" };
}

function stringifyRemarks(text: string, bold: boolean, italic: boolean, underline: boolean, color: string): string {
  if (!bold && !italic && !underline && !color) {
    return text;
  }
  return JSON.stringify({ text, bold, italic, underline, color });
}

function getColorCode(color: string, isDarkBg = false): string | undefined {
  switch (color) {
    case "red": return isDarkBg ? "#f87171" : "#dc2626";
    case "yellow": return isDarkBg ? "#fbbf24" : "#b45309";
    case "green": return isDarkBg ? "#4ade80" : "#16a34a";
    case "blue": return isDarkBg ? "#60a5fa" : "#2563eb";
    case "pink": return isDarkBg ? "#f472b6" : "#db2777";
    default: return undefined;
  }
}

function RemarksCell({ record, panel }: { record: GeneratorRecord; panel: string }) {
  const [open, setOpen] = useState(false);
  const [isClicked, setIsClicked] = useState(false);

  if (!record.remarks) return <span>-</span>;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextClicked = !isClicked;
    setIsClicked(nextClicked);
    setOpen(nextClicked);
  };

  const parsed = parseRemarks(record.remarks);

  return (
    <Tooltip open={open} onOpenChange={(val) => {
      if (!val) {
        setOpen(false);
        setIsClicked(false);
      }
    }}>
      <TooltipTrigger asChild>
        <span
          onClick={handleToggle}
          className="cursor-pointer hover:text-orange-500 transition-colors block truncate underline decoration-dotted decoration-gray-300 underline-offset-2"
          style={{
            fontWeight: parsed.bold ? "bold" : "normal",
            fontStyle: parsed.italic ? "italic" : "normal",
            textDecoration: parsed.underline ? "underline" : "none",
            color: parsed.color ? getColorCode(parsed.color) : undefined,
          }}
        >
          {parsed.text}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        onPointerDownOutside={(e) => {
          setOpen(false);
          setIsClicked(false);
        }}
        className="bg-slate-900 border border-slate-800 text-slate-100 px-4 py-3 rounded-xl shadow-xl max-w-xs text-xs font-normal"
      >
        <p
          className="whitespace-pre-wrap break-words leading-relaxed max-h-36 overflow-y-auto pr-1 text-[12px]"
          style={{
            fontWeight: parsed.bold ? "bold" : "normal",
            fontStyle: parsed.italic ? "italic" : "normal",
            textDecoration: parsed.underline ? "underline" : "none",
            color: parsed.color ? getColorCode(parsed.color, true) : "#e2e8f0",
          }}
        >
          {parsed.text}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading: isLoadingUser, isError: isUserError } = useGetMe({
    query: { queryKey: getGetMeQueryKey(), retry: false },
  });
  const logoutMutation = useLogout();
  const updateMeMutation = useUpdateMe();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<GeneratorRecord | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const isReadOnly = !!(user as any)?.isDemoUser && (user as any)?.permissions === "view";
  const [showCPanel, setShowCPanel] = useState(false);
  const [selectedCPanel, setSelectedCPanel] = useState<string | null>(null);

  // Download & Print state variables
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<number>>(new Set());
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadFilterScope, setDownloadFilterScope] = useState<"filtered" | "selected" | "custom">("filtered");
  const [downloadFilterDateType, setDownloadFilterDateType] = useState<"all" | "today" | "range">("all");
  const [downloadStartDate, setDownloadStartDate] = useState("");
  const [downloadEndDate, setDownloadEndDate] = useState("");
  const [downloadFilterModel, setDownloadFilterModel] = useState("all");
  const [downloadFilterStatus, setDownloadFilterStatus] = useState("all");

  // Dynamic panels/models state
  const [panels, setPanels] = useState<CPanelConfig[]>(DEFAULT_CPANELS);

  useEffect(() => {
    if (user) {
      if (user.customPanels) {
        try {
          const parsed = JSON.parse(user.customPanels);
          if (Array.isArray(parsed)) {
            setPanels(parsed);
            return;
          }
        } catch (e) {
          // fallback
        }
      } else {
        const saved = localStorage.getItem(`custom_cpanels_${user.id}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPanels(parsed);
              if (!isReadOnly) {
                updateMeMutation.mutate({ data: { customPanels: saved } });
              }
              return;
            }
          } catch (e) { }
        }
      }
    }
    setPanels(DEFAULT_CPANELS);
  }, [user]);

  // Modal helper states for adding custom models
  const [isAddSubModelOpen, setIsAddSubModelOpen] = useState(false);
  const [newModelNo, setNewModelNo] = useState("");
  const [newModelPrefix, setNewModelPrefix] = useState("");

  // Edit sub-model states
  const [isEditSubModelOpen, setIsEditSubModelOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<CPanelConfig | null>(null);
  const [editModelNo, setEditModelNo] = useState("");
  const [editModelPrefix, setEditModelPrefix] = useState("");

  // Delivery states
  const [viewMode, setViewMode] = useState<"main" | "delivery" | "previous">("main");
  const [deliveryModalRecord, setDeliveryModalRecord] = useState<GeneratorRecord | null>(null);
  const [receiverName, setReceiverName] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(TODAY);
  const [returnModalRecord, setReturnModalRecord] = useState<GeneratorRecord | null>(null);
  const [returnStatus, setReturnStatus] = useState("");
  const [returnDate, setReturnDate] = useState(TODAY);

  // Sheet access states
  const [showSheetPasswordModal, setShowSheetPasswordModal] = useState(false);
  const [sheetPassword, setSheetPassword] = useState("");
  const [sheetPasswordError, setSheetPasswordError] = useState("");
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [showSheetPasswordText, setShowSheetPasswordText] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => { },
  });

  const { data: stats } = useGetGeneratorStats({ query: { queryKey: getGetGeneratorStatsQueryKey() } });

  // Fetch ALL records — filtering is done client-side so C Panel stats are always accurate
  const { data: allGenerators, isLoading: isLoadingGenerators } = useListGenerators(
    undefined,
    { query: { queryKey: getListGeneratorsQueryKey() } }
  );

  // Client-side filtered list for the table (sorted by date: recent first, old at bottom)
  const generators = useMemo(() => {
    if (!allGenerators) return [];
    return allGenerators
      .filter((r) => {
        if (viewMode === "main") {
          if (r.deliveryStatus === "current") return false;
        } else if (viewMode === "delivery") {
          if (r.deliveryStatus !== "current") return false;
        } else if (viewMode === "previous") {
          if (r.deliveryStatus !== "previous") return false;
        }
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (selectedCPanel && getGeneratorPanel(r.generatorId, panels) !== selectedCPanel) return false;
        if (search) {
          const s = search.toLowerCase();
          const parsedRemarks = parseRemarks(r.remarks).text;
          return (
            r.generatorId.toLowerCase().includes(s) ||
            r.tDate.includes(s) ||
            parsedRemarks.toLowerCase().includes(s)
          );
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by date descending: recent dates at top, older dates at bottom
        if (a.tDate > b.tDate) return -1;
        if (a.tDate < b.tDate) return 1;
        return 0;
      });
  }, [allGenerators, statusFilter, selectedCPanel, search, viewMode, panels]);

  // Per C-Panel stats computed client-side
  const cpanelStats = useMemo(() => {
    if (!allGenerators) return null;
    return panels.map((panel) => {
      const records = allGenerators.filter((r) => getGeneratorPanel(r.generatorId, panels) === panel.id);
      const byStatus: Record<string, number> = {};
      for (const r of records) {
        byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      }
      return { ...panel, total: records.length, byStatus };
    });
  }, [allGenerators, panels]);

  const cpanelTotal = useMemo(
    () => allGenerators?.filter((r) => getGeneratorPanel(r.generatorId, panels) !== "Other").length ?? 0,
    [allGenerators, panels]
  );

  // Pre-compute selected panel data to avoid IIFE in JSX (which confuses React Fast Refresh)
  const selectedPanelData = useMemo(
    () => (selectedCPanel && cpanelStats ? cpanelStats.find((p) => p.id === selectedCPanel) ?? null : null),
    [selectedCPanel, cpanelStats]
  );

  const createMutation = useCreateGenerator();
  const updateMutation = useUpdateGenerator();
  const deleteMutation = useDeleteGenerator();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { tDate: TODAY, generatorId: "", status: "Ready", rating: "", hours: 0, remarks: "" },
  });

  useEffect(() => {
    if (isUserError || (!user && !isLoadingUser)) setLocation("/login");
  }, [user, isLoadingUser, isUserError, setLocation]);

  const openAdd = () => {
    setEditingRecord(null);
    form.reset({ tDate: TODAY, generatorId: "", status: "Ready", rating: "", hours: 0, remarks: "" });
    setIsFormOpen(true);
  };

  const openEdit = (record: GeneratorRecord) => {
    setEditingRecord(record);
    form.reset({
      tDate: record.tDate,
      generatorId: record.generatorId,
      status: record.status,
      rating: record.rating ?? "",
      hours: record.hours ?? 0,
      remarks: record.remarks ?? "",
    });
    setIsFormOpen(true);
  };

  const handleDelete = (id: number) => {
    setDeleteConfirmModal({
      isOpen: true,
      title: "Delete Generator Record",
      description: "You are deleting this data. This action is permanent and cannot be undone. Are you sure you want to proceed?",
      onConfirm: () => {
        deleteMutation.mutate({ id }, {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListGeneratorsQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetGeneratorStatsQueryKey() });
            setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));
          },
        });
      },
    });
  };

  const openDeliveryModal = (record: GeneratorRecord) => {
    setDeliveryModalRecord(record);
    setReceiverName("");
    setDeliveryDate(TODAY);
  };

  const submitDelivery = () => {
    if (!deliveryModalRecord || !receiverName.trim()) return;
    const statusUpdate = (deliveryModalRecord.status === "Ready" || deliveryModalRecord.status === "Used Ready")
      ? { status: "On-Site" }
      : {};
    updateMutation.mutate(
      {
        id: deliveryModalRecord.id,
        data: {
          deliveryStatus: "current",
          deliveryTo: receiverName.trim(),
          tDate: deliveryDate,
          ...statusUpdate,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGeneratorsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetGeneratorStatsQueryKey() });
          setDeliveryModalRecord(null);
        },
      }
    );
  };

  const openReturnModal = (record: GeneratorRecord) => {
    setReturnModalRecord(record);
    setReturnStatus("");
    setReturnDate(TODAY);
  };

  const submitReturn = () => {
    if (!returnModalRecord) return;
    updateMutation.mutate(
      {
        id: returnModalRecord.id,
        data: {
          status: returnStatus,
          deliveryStatus: "previous",
          tDate: returnDate,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListGeneratorsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetGeneratorStatsQueryKey() });
          setReturnModalRecord(null);
        },
      }
    );
  };

  const handleAddSubModelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = newModelNo.trim().toUpperCase();
    const prefixInput = newModelPrefix.trim().toUpperCase();

    if (!id || !prefixInput) return;

    // Check if model number already exists
    if (panels.some((p) => p.id === id)) {
      alert("A model with this number already exists.");
      return;
    }

    const prefixes = prefixInput.split(/[\s,;]+/).filter(Boolean);
    if (prefixes.length === 0) return;

    const newPanel: CPanelConfig = {
      id,
      label: `${id} - ${prefixes.join(", ")}`,
      prefixes: prefixes,
      isCustom: true,
    };

    const updated = [...panels, newPanel];
    setPanels(updated);
    if (user) {
      localStorage.setItem(`custom_cpanels_${user.id}`, JSON.stringify(updated));
    }

    if (!isReadOnly) {
      updateMeMutation.mutate(
        { data: { customPanels: JSON.stringify(updated) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          },
          onError: (err: any) => {
            toast({
              title: "Error saving model",
              description: err?.data?.error || err?.message || "Failed to save custom model in database",
              variant: "destructive",
            });
          },
        }
      );
    }

    setIsAddSubModelOpen(false);
    setNewModelNo("");
    setNewModelPrefix("");
  };

  const handleOpenEditSubModel = (panel: CPanelConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingPanel(panel);
    setEditModelNo(panel.id);
    setEditModelPrefix(panel.prefixes.join(" "));
    setIsEditSubModelOpen(true);
  };

  const handleEditSubModelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPanel) return;
    const newId = editModelNo.trim().toUpperCase();
    const newPrefixInput = editModelPrefix.trim().toUpperCase();
    if (!newId || !newPrefixInput) return;

    // If ID changed, check for duplicates
    if (newId !== editingPanel.id && panels.some((p) => p.id === newId)) {
      alert("A model with this number already exists.");
      return;
    }

    const prefixes = newPrefixInput.split(/[\s,;]+/).filter(Boolean);
    if (prefixes.length === 0) return;

    const updated = panels.map((p) =>
      p.id === editingPanel.id
        ? { ...p, id: newId, label: `${newId} - ${prefixes.join(", ")}`, prefixes }
        : p
    );
    setPanels(updated);
    if (user) {
      localStorage.setItem(`custom_cpanels_${user.id}`, JSON.stringify(updated));
    }
    if (selectedCPanel === editingPanel.id) setSelectedCPanel(newId);

    if (!isReadOnly) {
      updateMeMutation.mutate(
        { data: { customPanels: JSON.stringify(updated) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
          },
          onError: (err: any) => {
            toast({
              title: "Error updating model",
              description: err?.data?.error || err?.message || "Failed to save changes in database",
              variant: "destructive",
            });
          },
        }
      );
    }

    setIsEditSubModelOpen(false);
    setEditingPanel(null);
    setEditModelNo("");
    setEditModelPrefix("");
  };

  const handleDeleteSubModel = (panelId: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      title: "Delete Model",
      description: "You are deleting this data. This action is permanent and cannot be undone. Are you sure you want to proceed?",
      onConfirm: () => {
        const updated = panels.filter((p) => p.id !== panelId);
        setPanels(updated);
        if (user) {
          localStorage.setItem(`custom_cpanels_${user.id}`, JSON.stringify(updated));
        }
        if (selectedCPanel === panelId) {
          setSelectedCPanel(null);
        }

        // Close modal immediately — don't wait for the API call
        setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }));

        if (!isReadOnly) {
          updateMeMutation.mutate(
            { data: { customPanels: JSON.stringify(updated) } },
            {
              onSuccess: () => {
                queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
              },
              onError: (err: any) => {
                toast({
                  title: "Error deleting model",
                  description: err?.data?.error || err?.message || "Failed to save changes in database",
                  variant: "destructive",
                });
              },
            }
          );
        }
      },
    });
  };

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => { queryClient.clear(); setLocation("/login"); },
    });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListGeneratorsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetGeneratorStatsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    ]);
    setTimeout(() => setIsRefreshing(false), 700);
  };

  const openSheetPasswordModal = () => {
    setSheetPassword("");
    setSheetPasswordError("");
    setShowSheetPasswordText(false);
    setShowSheetPasswordModal(true);
  };

  const closeSheetPasswordModal = () => {
    setShowSheetPasswordModal(false);
    setSheetPassword("");
    setSheetPasswordError("");
  };

  const verifyPasswordAndOpenSheet = async () => {
    if (!sheetPassword.trim()) {
      setSheetPasswordError("Please enter your password.");
      return;
    }
    setIsVerifyingPassword(true);
    setSheetPasswordError("");
    try {
      const res = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: sheetPassword }),
      });
      if (res.ok) {
        const sheetLink = (user as any)?.sheetLink;
        if (sheetLink) {
          window.open(sheetLink, "_blank", "noopener,noreferrer");
        }
        closeSheetPasswordModal();
      } else {
        const data = await res.json().catch(() => ({}));
        setSheetPasswordError(data.error || "Incorrect password. Please try again.");
      }
    } catch {
      setSheetPasswordError("Connection error. Please try again.");
    } finally {
      setIsVerifyingPassword(false);
    }
  };

  const onSubmit = (values: FormValues) => {
    // Client-side check for duplicate Genset ID
    const isDuplicate = allGenerators?.some((r) => {
      if (editingRecord && r.id === editingRecord.id) return false;
      return r.generatorId.toLowerCase().trim() === values.generatorId.toLowerCase().trim();
    });

    if (isDuplicate) {
      toast({
        title: "Duplicate Genset ID",
        description: "This genset ID is already exists",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      ...values,
      rating: values.rating || undefined,
      hours: values.hours ?? undefined,
      remarks: values.remarks || undefined,
    };
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: getListGeneratorsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetGeneratorStatsQueryKey() });
      setIsFormOpen(false);
      setEditingRecord(null);
    };
    if (editingRecord) {
      updateMutation.mutate(
        { id: editingRecord.id, data: payload },
        {
          onSuccess: invalidate,
          onError: (err: any) => {
            const errMsg = err?.data?.error || err?.message || "Failed to update record";
            toast({
              title: "Error",
              description: errMsg,
              variant: "destructive",
            });
          },
        }
      );
    } else {
      createMutation.mutate(
        { data: payload },
        {
          onSuccess: invalidate,
          onError: (err: any) => {
            const errMsg = err?.data?.error || err?.message || "Failed to create record";
            toast({
              title: "Error",
              description: errMsg,
              variant: "destructive",
            });
          },
        }
      );
    }
  };

  // Filter logic for export/print
  const getExportData = () => {
    // 1. If scope is 'selected', return selected records
    if (downloadFilterScope === "selected") {
      if (!allGenerators) return [];
      return allGenerators.filter(r => selectedRecordIds.has(r.id));
    }

    // 2. If scope is 'filtered', return generators currently visible in the table
    if (downloadFilterScope === "filtered") {
      return generators;
    }

    // 3. If scope is 'custom', apply custom filters configured in the modal
    if (!allGenerators) return [];
    return allGenerators.filter((r) => {
      // Date filter
      if (downloadFilterDateType === "today") {
        const todayStr = new Date().toISOString().split("T")[0];
        if (r.tDate !== todayStr) return false;
      } else if (downloadFilterDateType === "range") {
        if (downloadStartDate && r.tDate < downloadStartDate) return false;
        if (downloadEndDate && r.tDate > downloadEndDate) return false;
      }

      // Model/Panel filter
      if (downloadFilterModel !== "all") {
        const panel = getGeneratorPanel(r.generatorId, panels);
        if (panel !== downloadFilterModel) return false;
      }

      // Status filter
      if (downloadFilterStatus !== "all") {
        if (r.status !== downloadFilterStatus) return false;
      }

      return true;
    });
  };

  const handleDownloadPDF = () => {
    const records = getExportData();
    if (records.length === 0) {
      toast({
        title: "No data found",
        description: "There are no records matching the selected filters.",
        variant: "destructive"
      });
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    // Add GenOps title and styling
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(31, 31, 46); // #1f1f2e
    doc.text("GenOps", 10, 15);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128); // #6b7280
    doc.text("Generator Management & Operations System Report", 10, 20);

    doc.setFontSize(9);
    doc.setTextColor(75, 85, 99); // #4b5563
    const reportDate = `Report Date: ${new Date().toLocaleString()}`;
    const recordCount = `Record Count: ${records.length}`;
    doc.text(reportDate, 200, 15, { align: "right" });
    doc.text(recordCount, 200, 20, { align: "right" });

    // Draw a divider line
    doc.setDrawColor(255, 108, 0); // #ff6c00
    doc.setLineWidth(0.5);
    doc.line(10, 23, 200, 23);

    // Columns
    const headers = [
      "Date",
      "GENSET ID",
      "Model",
      "Status",
      "Rating",
      "Hours",
      "Remarks",
      "Delivered To"
    ];

    const rows = records.map(r => [
      formatDate(r.tDate),
      r.generatorId,
      getGeneratorPanel(r.generatorId, panels) !== "Other" ? getGeneratorPanel(r.generatorId, panels) : "—",
      r.status,
      r.rating || "—",
      r.hours != null ? `${r.hours}h` : "—",
      parseRemarks(r.remarks).text || "—",
      r.deliveryTo || "—"
    ]);

    // Helper: convert hex color to RGB array for jsPDF
    const hexToRgb = (hex: string): [number, number, number] => {
      const h = hex.replace("#", "");
      return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
      ];
    };

    // Helper: convert named remark color to hex
    const remarkColorToHex = (color: string): string | null => {
      switch (color) {
        case "red": return "#dc2626";
        case "yellow": return "#b45309";
        case "green": return "#16a34a";
        case "blue": return "#2563eb";
        case "pink": return "#db2777";
        default: return null;
      }
    };

    autoTable(doc, {
      startY: 27,
      head: [headers],
      body: rows,
      theme: "plain",
      headStyles: {
        fillColor: [31, 31, 46], // #1f1f2e
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8.5,
        halign: "left",
        cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [55, 65, 81], // #374151
        valign: "middle",
        fillColor: [255, 255, 255],
        cellPadding: { top: 1.5, right: 3, bottom: 1.5, left: 3 },
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255],
      },
      columnStyles: {
        0: { cellWidth: 22 }, // Date
        1: { cellWidth: 25, fontStyle: "bold" }, // GENSET ID
        2: { cellWidth: 22 }, // Model
        3: { cellWidth: 25 }, // Status
        4: { cellWidth: 18 }, // Rating
        5: { cellWidth: 15 }, // Hours
        6: { cellWidth: 38 }, // Remarks
        7: { cellWidth: 25 }  // Delivered To
      },
      styles: {
        overflow: "linebreak",
        lineColor: [229, 231, 235], // #e5e7eb border
        lineWidth: 0.1,
      },
      margin: { top: 10, right: 10, bottom: 15, left: 10 },
      didParseCell: (data) => {
        if (data.section !== "body") return;
        const record = records[data.row.index];
        if (!record) return;

        // Column 3 = Status — apply status color
        if (data.column.index === 3) {
          const cfg = STATUS_CONFIG[record.status];
          if (cfg) {
            data.cell.styles.textColor = hexToRgb(cfg.text);
            data.cell.styles.fontStyle = "bold";
          }
        }

        // Column 6 = Remarks — apply remark color
        if (data.column.index === 6) {
          const parsed = parseRemarks(record.remarks);
          if (parsed.color) {
            const hex = remarkColorToHex(parsed.color);
            if (hex) {
              data.cell.styles.textColor = hexToRgb(hex);
            }
          }
          if (parsed.bold) {
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      didDrawPage: (data) => {
        // Footer (Page X of Y)
        const str = `Page ${data.pageNumber}`;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175); // #9ca3af
        doc.text(str, 200, 287, { align: "right" });
      }
    });

    doc.save(`generator_records_${new Date().toISOString().split("T")[0]}.pdf`);

    toast({
      title: "Success",
      description: `Successfully downloaded ${records.length} records as PDF.`
    });

    setIsDownloadModalOpen(false);
  };

  const handlePrint = () => {
    const records = getExportData();
    if (records.length === 0) {
      toast({
        title: "No data found",
        description: "There are no records matching the selected filters.",
        variant: "destructive"
      });
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups to print report.",
        variant: "destructive"
      });
      return;
    }

    const title = `Generator Records Report - ${new Date().toLocaleDateString()}`;
    const rowsHtml = records.map(r => {
      const statusCfg = STATUS_CONFIG[r.status];
      const statusColor = statusCfg ? statusCfg.text : "#374151";
      const parsedR = parseRemarks(r.remarks);
      const remarkHex = parsedR.color ? ({
        red: "#dc2626", yellow: "#b45309", green: "#16a34a",
        blue: "#2563eb", pink: "#db2777"
      } as Record<string, string>)[parsedR.color] || "" : "";
      const remarkStyle = [
        remarkHex ? `color:${remarkHex}` : "",
        parsedR.bold ? "font-weight:bold" : "",
        parsedR.italic ? "font-style:italic" : "",
        parsedR.underline ? "text-decoration:underline" : "",
      ].filter(Boolean).join(";");
      return `
      <tr>
        <td>${formatDate(r.tDate)}</td>
        <td><strong>${r.generatorId}</strong></td>
        <td>${getGeneratorPanel(r.generatorId, panels) !== "Other" ? getGeneratorPanel(r.generatorId, panels) : "—"}</td>
        <td style="color:${statusColor};font-weight:bold">${r.status}</td>
        <td>${r.rating || "—"}</td>
        <td>${r.hours != null ? `${r.hours}h` : "—"}</td>
        <td${remarkStyle ? ` style="${remarkStyle}"` : ""}>${parsedR.text || "—"}</td>
        <td>${r.deliveryTo || "—"}</td>
      </tr>
    `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              color: #111827;
              padding: 20px 18px;
              margin: 0;
              line-height: 1.3;
              background: #fff;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 2px solid #ff6c00;
              padding-bottom: 10px;
              margin-bottom: 12px;
            }
            .logo-title {
              font-size: 22px;
              font-weight: 800;
              color: #1f1f2e;
            }
            .subtitle {
              font-size: 12px;
              color: #6b7280;
              margin-top: 2px;
            }
            .meta {
              font-size: 11px;
              color: #4b5563;
              text-align: right;
              line-height: 1.4;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 11px;
              margin-top: 8px;
              border: 1px solid #e5e7eb;
            }
            th {
              background-color: #1f1f2e;
              color: #ffffff;
              font-weight: 700;
              text-transform: uppercase;
              font-size: 9px;
              letter-spacing: 0.05em;
              border: 1px solid #374151;
              padding: 5px 7px;
              text-align: left;
            }
            td {
              padding: 4px 7px;
              border: 1px solid #e5e7eb;
              color: #374151;
              background-color: #ffffff;
              vertical-align: middle;
            }
            @media print {
              body { padding: 0; background: #fff; }
              @page { margin: 1cm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo-title">GenOps</div>
              <div class="subtitle">Generator Management & Operations System Report</div>
            </div>
            <div class="meta">
              <div><strong>Report Date:</strong> ${new Date().toLocaleString()}</div>
              <div><strong>Record Count:</strong> ${records.length}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Date</th>
                <th style="width: 15%;">GENSET ID</th>
                <th style="width: 10%;">Model</th>
                <th style="width: 15%;">Status</th>
                <th style="width: 10%;">Rating</th>
                <th style="width: 8%;">Hours</th>
                <th>Remarks</th>
                <th style="width: 14%;">Delivered To</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
    setIsDownloadModalOpen(false);
  };

  if (isLoadingUser || !user) return null;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#efebe4" }}>

      {/* Top navigation bar */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#ff6c00" }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight" style={{ color: "#1f1f2e" }}>GenOps</span>
            <span className="hidden md:inline-block ml-2 text-xs font-medium px-2 py-0.5 rounded" style={{ background: "#fff7ed", color: "#ff6c00" }}>
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsProfileOpen(true)}
              className="hidden md:flex items-center gap-2 text-sm hover:opacity-85 transition-opacity cursor-pointer mr-2 border border-transparent p-1 rounded-lg hover:bg-gray-50"
              title="Open Profile Settings"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-semibold text-white text-xs bg-orange-500 shadow-sm shadow-orange-500/10">
                {user.username[0].toUpperCase()}
              </div>
              <span className="font-semibold text-gray-700">{user.username}</span>
              {user.isDemoUser && (
                <span className="text-[10px] font-bold px-1.5 py-0.25 bg-blue-50 text-blue-600 rounded border border-blue-100 uppercase">
                  Guest
                </span>
              )}
            </button>
            <button
              onClick={() => setIsProfileOpen(true)}
              className="flex md:hidden items-center justify-center w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors mr-1"
              title="Open Profile Settings"
            >
              <div className="w-5 h-5 rounded-full flex items-center justify-center font-bold text-white text-[10px]" style={{ background: "#ff6c00" }}>
                {user.username[0].toUpperCase()}
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              style={{ color: "#6b7280" }}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-xl mx-auto w-full px-6 py-8 flex flex-col gap-6">

        {/* Page title + action buttons */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#111827" }}>Generator Records</h1>
            <p className="text-sm mt-1" style={{ color: "#6b7280" }}>All entries are synced to your Google Sheet automatically.</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Refresh button */}
            <button
              id="button-refresh-data"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh all data"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {/* Download Data button */}
            <button
              id="button-download-data"
              onClick={() => setIsDownloadModalOpen(true)}
              title="Download or Print Generator Data"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 transition-all shadow-sm active:scale-95 hover:scale-105"
            >
              <Download className="w-3.5 h-3.5 text-gray-600" />
              <span className="hidden sm:inline">Download Data</span>
              <span className="inline sm:hidden">Download</span>
            </button>

            {(user as any)?.sheetLink && (
              /* Open Sheet button (password-protected) */
              <button
                id="button-open-sheet"
                onClick={openSheetPasswordModal}
                title="Open Google Sheet (requires password)"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white transition-all shadow-sm hover:opacity-90 active:scale-95"
                style={{ background: "#ff6c00" }}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Open Sheet</span>
              </button>
            )}
          </div>
        </div>

        {/* Stat cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Database className="w-5 h-5" />}
              label="Total Records"
              value={stats.total}
              onClick={() => setViewMode("main")}
              isActive={viewMode === "main"}
            />
            <StatCard
              icon={<Zap className="w-5 h-5" />}
              label=" All Model"
              value={cpanelTotal}
              accent="#7c3aed"
              onClick={() => {
                setShowCPanel((v) => !v);
                setSelectedCPanel(null);
              }}
              isActive={showCPanel}
            />
            <StatCard
              icon={<Truck className="w-5 h-5" />}
              label="Current Delivery"
              value={stats.currentDelivery}
              accent="#0891b2"
              onClick={() => setViewMode("delivery")}
              isActive={viewMode === "delivery"}
            />
            <StatCard
              icon={<Truck className="w-5 h-5" />}
              label="Previous Delivery"
              value={stats.previousDelivery}
              accent="#1e3a5f"
              onClick={() => setViewMode("previous")}
              isActive={viewMode === "previous"}
            />
          </div>
        )}

        {/* C Panel expandable section */}
        <AnimatePresence>
          {showCPanel && (
            <motion.div
              key="cpanel"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="bg-white rounded-xl border border-purple-200 shadow-sm overflow-hidden"
              style={{ borderColor: "#7c3aed33" }}
            >
              <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "#f3f0ff", background: "#faf5ff" }}>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: "#7c3aed" }}>Sub-Model</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>Click a model to view its stats and filter the table below</p>
                </div>
                <Button
                  size="sm"
                  disabled={isReadOnly}
                  onClick={() => {
                    setNewModelNo("");
                    setNewModelPrefix("");
                    setIsAddSubModelOpen(true);
                  }}
                  className="h-8 px-3 text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isReadOnly ? "Disabled in view-only guest session" : ""}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New Model
                </Button>
              </div>              <div className="p-5">
                {/* Sub-panel cards - rectangular layout matching image style */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {cpanelStats && [...cpanelStats]
                    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" }))
                    .map((panel) => (
                      <div
                        key={panel.id}
                        className="relative group"
                      >
                        <button
                          onClick={() => setSelectedCPanel(selectedCPanel === panel.id ? null : panel.id)}
                          className="w-full rounded-xl p-4 flex flex-col gap-2 text-left border transition-all hover:shadow-md"
                          style={{
                            borderColor: selectedCPanel === panel.id ? "#7c3aed" : "#e5e7eb",
                            background: selectedCPanel === panel.id ? "#f5f3ff" : "#ffffff",
                            boxShadow: selectedCPanel === panel.id ? "0 0 0 2px #7c3aed33" : "0 1px 3px rgba(0,0,0,0.06)",
                          }}
                        >
                          <div className="min-w-0 w-full pr-10">
                            <p className="text-sm font-bold truncate" style={{ color: selectedCPanel === panel.id ? "#7c3aed" : "#1f2937" }}>
                              {panel.id}
                            </p>
                            <p className="text-[11px] mt-0.5 truncate" style={{ color: "#9ca3af" }}>
                              {panel.prefixes.join(", ")}
                            </p>
                          </div>
                          <p className="text-2xl font-black leading-none" style={{ color: selectedCPanel === panel.id ? "#7c3aed" : "#111827" }}>
                            {panel.total}
                          </p>
                        </button>
                        {/* Edit + Delete icons - visible on hover or when selected */}
                        <div className={`absolute top-2.5 right-2.5 flex items-center gap-0.5 transition-opacity duration-200 ${selectedCPanel === panel.id
                          ? "opacity-100 pointer-events-auto"
                          : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                          }`}>
                          {!isReadOnly && (
                            <>
                              <button
                                onClick={(e) => handleOpenEditSubModel(panel, e)}
                                className="p-1 rounded-md text-purple-400 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                                title="Edit Model"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSubModel(panel.id);
                                }}
                                className="p-1 rounded-md text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Delete Model"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Selected panel stats */}
                <AnimatePresence>
                  {selectedPanelData && (
                    <motion.div
                      key={selectedPanelData.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: "#f3f0ff" }}>
                        <h4 className="text-sm font-semibold mb-3" style={{ color: "#374151" }}>
                          {selectedPanelData.label} — Status Breakdown
                        </h4>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          <div className="rounded-xl p-4 text-center border border-gray-200" style={{ background: "#f9fafb" }}>
                            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#6b7280" }}>Total</p>
                            <p className="text-2xl font-bold mt-1" style={{ color: "#111827" }}>{selectedPanelData.total}</p>
                          </div>
                          {STATUSES.map((status) => {
                            const cfg = STATUS_CONFIG[status];
                            return (
                              <div
                                key={status}
                                className="rounded-xl p-4 text-center border"
                                style={{ background: cfg.bg, borderColor: `${cfg.dot}44` }}
                              >
                                <p className="text-xs font-semibold uppercase tracking-wide truncate" style={{ color: cfg.text }}>{status}</p>
                                <p className="text-2xl font-bold mt-1" style={{ color: cfg.text }}>{selectedPanelData.byStatus[status] ?? 0}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status breakdown pills */}
        {stats && stats.byStatus.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedCPanel && (
              <button
                onClick={() => { setSelectedCPanel(null); setShowCPanel(false); }}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={{ background: "#f5f3ff", color: "#7c3aed", borderColor: "#7c3aed" }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#7c3aed" }} />
                {panels.find(p => p.id === selectedCPanel)?.label} <X className="w-3 h-3 ml-1" />
              </button>
            )}
            {stats.byStatus.map(s => (
              <button
                key={s.status}
                onClick={() => setStatusFilter(statusFilter === s.status ? "all" : s.status)}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border transition-all"
                style={{
                  background: statusFilter === s.status ? (STATUS_CONFIG[s.status]?.bg ?? "#f8fafc") : "#fff",
                  color: STATUS_CONFIG[s.status]?.text ?? "#64748b",
                  borderColor: statusFilter === s.status ? (STATUS_CONFIG[s.status]?.dot ?? "#94a3b8") : "#e5e7eb",
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_CONFIG[s.status]?.dot ?? "#94a3b8" }} />
                {s.status}: {s.count}
              </button>
            ))}
          </div>
        )}

        {/* Table card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between px-5 py-4 border-b border-gray-100">
            <div className="flex gap-3 flex-1 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9ca3af" }} />
                <Input
                  placeholder="Search by ID, date or remarks..."
                  className="pl-9 h-9 text-sm bg-gray-50 border-gray-200"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 h-9 text-sm bg-gray-50 border-gray-200" data-testid="select-status-filter">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Ready">Ready</SelectItem>
                  <SelectItem value="Used Ready">Used Ready</SelectItem>
                  <SelectItem value="Under Repair">Under Repair</SelectItem>
                  <SelectItem value="Under Readiness">Under Readiness</SelectItem>
                  <SelectItem value="On-Site">On-Site</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 h-9">
                <button
                  type="button"
                  onClick={() => setViewMode("main")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === "main" ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-500 hover:text-gray-900"}`}
                  data-testid="button-view-main"
                >
                  Main View
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("delivery")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === "delivery" ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-500 hover:text-gray-900"}`}
                  data-testid="button-view-delivery"
                >
                  Current Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("previous")}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === "previous" ? "bg-white text-gray-900 shadow-sm border border-gray-100" : "text-gray-500 hover:text-gray-900"}`}
                  data-testid="button-view-previous"
                >
                  Previous Delivery
                </button>
              </div>
            </div>
            <Button
              onClick={openAdd}
              disabled={isReadOnly}
              className="h-9 px-4 text-sm font-semibold text-white rounded-lg flex items-center gap-2 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "#ff6c00" }}
              data-testid="button-add-record"
              title={isReadOnly ? "Disabled in view-only guest session" : ""}
            >
              <Plus className="w-4 h-4" />
              Add Record
            </Button>
          </div>

          {selectedCPanel && (
            <div className="px-5 py-2.5 border-b text-xs font-medium flex items-center gap-2" style={{ background: "#faf5ff", borderColor: "#ede9fe", color: "#7c3aed" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
              Filtering by {panels.find(p => p.id === selectedCPanel)?.label}
              <button onClick={() => setSelectedCPanel(null)} className="ml-1 underline hover:no-underline">Clear</button>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-[#f9fafb] shadow-[0_1px_0_0_rgba(229,231,235,1)]">
                <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                  <th className="px-5 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={generators.length > 0 && generators.every(r => selectedRecordIds.has(r.id))}
                      onChange={(e) => {
                        const newIds = new Set(selectedRecordIds);
                        if (e.target.checked) {
                          generators.forEach(r => newIds.add(r.id));
                        } else {
                          generators.forEach(r => newIds.delete(r.id));
                        }
                        setSelectedRecordIds(newIds);
                      }}
                      className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 h-4 w-4 cursor-pointer"
                    />
                  </th>
                  {(viewMode === "delivery"
                    ? ["Date", "GENSET ID", "Model", "Status", "Rating", "Hours", "Remarks", "Delivered To", "R", ""]
                    : viewMode === "previous"
                      ? ["Date", "GENSET ID", "Model", "Status", "Rating", "Hours", "Remarks", "Prev Delivered To", ""]
                      : ["Date", "GENSET ID", "Model", "Status", "Rating", "Hours", "Remarks", "D", ""]
                  ).map(h => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "#6b7280" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoadingGenerators ? (
                  <tr>
                    <td colSpan={viewMode === "delivery" ? 11 : 10} className="px-5 py-12 text-center text-sm" style={{ color: "#9ca3af" }}>
                      Loading records...
                    </td>
                  </tr>
                ) : generators.length > 0 ? (
                  generators.map((record, idx) => {
                    const panel = getGeneratorPanel(record.generatorId, panels);
                    return (
                      <tr
                        key={record.id}
                        style={{ borderBottom: idx < generators.length - 1 ? "1px solid #f3f4f6" : "none" }}
                        className="hover:bg-orange-50/40 transition-colors"
                        data-testid={`row-generator-${record.id}`}
                      >
                        <td className="px-5 py-3.5 w-10">
                          <input
                            type="checkbox"
                            checked={selectedRecordIds.has(record.id)}
                            onChange={(e) => {
                              const newIds = new Set(selectedRecordIds);
                              if (e.target.checked) {
                                newIds.add(record.id);
                              } else {
                                newIds.delete(record.id);
                              }
                              setSelectedRecordIds(newIds);
                            }}
                            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-3.5 font-medium" style={{ color: "#374151" }}>{formatDate(record.tDate)}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold" style={{ color: "#111827" }}>{record.generatorId}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {panel !== "Other" ? (
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold"
                              style={{ background: "#f5f3ff", color: "#7c3aed" }}
                            >
                              {panel}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "#d1d5db" }}>—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={record.status} />
                        </td>
                        <td className="px-5 py-3.5" style={{ color: "#6b7280" }}>{record.rating || "-"}</td>
                        <td className="px-5 py-3.5 font-medium" style={{ color: "#374151" }}>{record.hours != null ? `${record.hours}h` : "-"}</td>
                        <td className="px-5 py-3.5 max-w-xs truncate" style={{ color: "#6b7280" }}>
                          <RemarksCell record={record} panel={panel} />
                        </td>
                        {(viewMode === "delivery" || viewMode === "previous") && (
                          <td className="px-5 py-3.5 font-medium" style={{ color: "#374151" }}>
                            {record.deliveryTo || "-"}
                          </td>
                        )}
                        {/* D / R — Delivery button */}
                        {viewMode !== "previous" && (
                          <td className="px-5 py-3.5">
                            {viewMode === "delivery" ? (
                              <button
                                onClick={() => openReturnModal(record)}
                                disabled={isReadOnly}
                                title={isReadOnly ? "Disabled in view-only session" : "Return Generator"}
                                className="p-1.5 rounded-lg transition-colors hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                  background: "#fef2f2",
                                  border: "1px solid #fee2e2",
                                }}
                                data-testid={`button-return-${record.id}`}
                              >
                                <Truck
                                  className="w-3.5 h-3.5"
                                  style={{ color: "#dc2626" }}
                                />
                              </button>
                            ) : (
                              (() => {
                                const isDeliverable = (record.status === "Ready" || record.status === "Used Ready") && !isReadOnly;
                                const cfg = STATUS_CONFIG[record.status] ?? STATUS_CONFIG["On-Site"];
                                return (
                                  <button
                                    onClick={() => openDeliveryModal(record)}
                                    disabled={!isDeliverable}
                                    title={isReadOnly ? "Disabled in view-only session" : isDeliverable ? "Deliver Generator" : "Only 'Ready' or 'Used Ready' generators can be delivered"}
                                    className="p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    style={{
                                      background: isDeliverable ? cfg.bg : "#f3f4f6",
                                      border: `1px solid ${isDeliverable ? cfg.dot : "#e5e7eb"}`,
                                    }}
                                    data-testid={`button-deliver-${record.id}`}
                                  >
                                    <Truck
                                      className="w-3.5 h-3.5"
                                      style={{ color: isDeliverable ? cfg.text : "#9ca3af" }}
                                    />
                                  </button>
                                );
                              })()
                            )}
                          </td>
                        )}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEdit(record)}
                              disabled={isReadOnly}
                              className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isReadOnly ? "Disabled in view-only session" : "Edit"}
                              data-testid={`button-edit-${record.id}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" style={{ color: isReadOnly ? "#9ca3af" : "#3b82f6" }} />
                            </button>
                            <button
                              onClick={() => handleDelete(record.id)}
                              disabled={isReadOnly}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                              title={isReadOnly ? "Disabled in view-only session" : "Delete"}
                              data-testid={`button-delete-${record.id}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" style={{ color: isReadOnly ? "#9ca3af" : "#ef4444" }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={viewMode === "delivery" ? 11 : 10} className="px-5 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#fff7ed" }}>
                          <Database className="w-6 h-6" style={{ color: "#ff6c00" }} />
                        </div>
                        <p className="text-sm font-medium" style={{ color: "#374151" }}>No records found</p>
                        <p className="text-xs" style={{ color: "#9ca3af" }}>
                          {selectedCPanel ? `No records in ${panels.find(p => p.id === selectedCPanel)?.label}` : 'Click "Add Record" to create your first entry'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {generators.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs" style={{ color: "#9ca3af" }}>
              Showing {generators.length} record{generators.length !== 1 ? "s" : ""}
              {selectedCPanel && ` in ${panels.find(p => p.id === selectedCPanel)?.label}`}
            </div>
          )}
        </div>
      </main>

      {/* Slide-over form panel */}
      <AnimatePresence>
        {isFormOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30"
              style={{ background: "rgba(0,0,0,0.35)" }}
              onClick={() => setIsFormOpen(false)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed right-0 top-0 h-full w-full sm:w-[460px] z-40 flex flex-col shadow-2xl"
              style={{ background: "#fff" }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
                <div>
                  <h2 className="text-lg font-bold" style={{ color: "#111827" }}>
                    {editingRecord ? "Edit Record" : "New Generator Record"}
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: "#9ca3af" }}>
                    {editingRecord ? "Update the record details below" : "Fill in the details and save to sync with Google Sheets"}
                  </p>
                </div>
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  data-testid="button-close-form"
                >
                  <X className="w-5 h-5" style={{ color: "#6b7280" }} />
                </button>
              </div>

              {/* Panel body */}
              <div className="flex-1 overflow-y-auto px-6 py-6">
                <Form {...form}>
                  <form id="generator-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="tDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>Date</FormLabel>
                            <FormControl>
                              <Input type="date" className="h-10 bg-gray-50 border-gray-200" data-testid="input-date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="generatorId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>GENSET ID</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. ECW-001, LX9-02" className="h-10 bg-gray-50 border-gray-200" data-testid="input-generator-id" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>Status</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="h-10 bg-gray-50 border-gray-200" data-testid="select-status">
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Ready">Ready</SelectItem>
                                <SelectItem value="Used Ready">Used Ready</SelectItem>
                                <SelectItem value="Under Repair">Under Repair</SelectItem>
                                <SelectItem value="Under Readiness">Under Readiness</SelectItem>
                                <SelectItem value="On-Site">On-Site</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="hours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>Hours</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                placeholder="0"
                                className="h-10 bg-gray-50 border-gray-200"
                                data-testid="input-hours"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>Rating</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g. 500kVA, Good, Excellent"
                              className="h-10 bg-gray-50 border-gray-200"
                              data-testid="input-rating"
                              {...field}
                              value={field.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="remarks"
                      render={({ field }) => {
                        const { text, bold, italic, underline, color } = parseRemarks(field.value);
                        return (
                          <FormItem>
                            <FormLabel className="text-sm font-medium" style={{ color: "#374151" }}>Remarks</FormLabel>
                            <div className="flex flex-col gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                              {/* Styling toolbar */}
                              <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-1">
                                <div className="flex items-center gap-1.5">
                                  {/* Bold button */}
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(stringifyRemarks(text, !bold, italic, underline, color))}
                                    className={`w-7 h-7 rounded flex items-center justify-center font-bold text-sm border transition-colors ${bold ? "bg-[#ff6c00]/10 border-[#ff6c00] text-[#ff6c00]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                                      }`}
                                  >
                                    B
                                  </button>
                                  {/* Italic button */}
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(stringifyRemarks(text, bold, !italic, underline, color))}
                                    className={`w-7 h-7 rounded flex items-center justify-center italic text-sm border transition-colors ${italic ? "bg-[#ff6c00]/10 border-[#ff6c00] text-[#ff6c00]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                                      }`}
                                  >
                                    I
                                  </button>
                                  {/* Underline button */}
                                  <button
                                    type="button"
                                    onClick={() => field.onChange(stringifyRemarks(text, bold, italic, !underline, color))}
                                    className={`w-7 h-7 rounded flex items-center justify-center underline text-sm border transition-colors ${underline ? "bg-[#ff6c00]/10 border-[#ff6c00] text-[#ff6c00]" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-100"
                                      }`}
                                  >
                                    U
                                  </button>
                                </div>

                                {/* Color picker */}
                                <div className="flex items-center gap-1.5">
                                  {[
                                    { name: "red", bg: "bg-red-500" },
                                    { name: "yellow", bg: "bg-amber-500" },
                                    { name: "green", bg: "bg-green-500" },
                                    { name: "blue", bg: "bg-blue-500" },
                                    { name: "pink", bg: "bg-pink-500" }
                                  ].map((c) => (
                                    <button
                                      key={c.name}
                                      type="button"
                                      onClick={() => field.onChange(stringifyRemarks(text, bold, italic, underline, color === c.name ? "" : c.name))}
                                      className={`w-5 h-5 rounded-full border-2 transition-all ${c.bg} ${color === c.name ? "border-slate-800 scale-110 shadow-sm" : "border-transparent hover:scale-105"
                                        }`}
                                      title={`Color: ${c.name}`}
                                    />
                                  ))}
                                  {color && (
                                    <button
                                      type="button"
                                      onClick={() => field.onChange(stringifyRemarks(text, bold, italic, underline, ""))}
                                      className="text-[10px] text-gray-400 hover:text-gray-600 underline ml-1"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                              </div>

                              <FormControl>
                                <Textarea
                                  placeholder="Any additional notes..."
                                  className="bg-white border-0 focus-visible:ring-0 focus-visible:ring-offset-0 p-1 resize-none text-sm leading-relaxed focus-visible:outline-none focus:outline-none"
                                  rows={3}
                                  data-testid="input-remarks"
                                  style={{
                                    fontWeight: bold ? "bold" : "normal",
                                    fontStyle: italic ? "italic" : "normal",
                                    textDecoration: underline ? "underline" : "none",
                                    color: color ? getColorCode(color) : undefined,
                                  }}
                                  value={text}
                                  onChange={(e) => field.onChange(stringifyRemarks(e.target.value, bold, italic, underline, color))}
                                />
                              </FormControl>
                            </div>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </form>
                </Form>
              </div>

              {/* Panel footer */}
              <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-10"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="generator-form"
                  disabled={isPending}
                  className="flex-1 h-10 font-semibold text-white"
                  style={{ background: "#ff6c00" }}
                >
                  {isPending ? "Saving..." : editingRecord ? "Update Record" : "Save Record"}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Delivery Modal */}
      <AnimatePresence>
        {deliveryModalRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setDeliveryModalRecord(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900">To Delivery</h3>
                <button
                  onClick={() => setDeliveryModalRecord(null)}
                  className="text-gray-400 hover:text-gray-500 rounded-lg p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Receiver Name</label>
                  <Input
                    placeholder="Enter receiver's name"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="h-10 border-gray-200 bg-gray-50 focus-visible:ring-[#ff6c00]"
                    data-testid="input-receiver-name"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Delivery Date</label>
                  <Input
                    type="date"
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="h-10 border-gray-200 bg-gray-50 focus-visible:ring-[#ff6c00]"
                    data-testid="input-delivery-date"
                  />
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setDeliveryModalRecord(null)}
                  className="flex-1 h-10 text-sm font-medium"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={submitDelivery}
                  disabled={!receiverName.trim() || updateMutation.isPending}
                  className="flex-1 h-10 text-sm font-semibold text-white"
                  style={{ background: "#ff6c00" }}
                >
                  {updateMutation.isPending ? "Submitting..." : "Confirm Delivery"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return Modal */}
      <AnimatePresence>
        {returnModalRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setReturnModalRecord(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900">Return Generator</h3>
                <button
                  onClick={() => setReturnModalRecord(null)}
                  className="text-gray-400 hover:text-gray-500 rounded-lg p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">New Status</label>
                  <Select value={returnStatus} onValueChange={setReturnStatus}>
                    <SelectTrigger className="h-10 bg-gray-50 border-gray-200">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ready">Ready</SelectItem>
                      <SelectItem value="Used Ready">Used Ready</SelectItem>
                      <SelectItem value="Under Repair">Under Repair</SelectItem>
                      <SelectItem value="Under Readiness">Under Readiness</SelectItem>
                      <SelectItem value="On-Site">On-Site</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1">Return Date</label>
                  <Input
                    type="date"
                    value={returnDate}
                    onChange={(e) => setReturnDate(e.target.value)}
                    className="h-10 border-gray-200 bg-gray-50 focus-visible:ring-[#ff6c00]"
                    data-testid="input-return-date"
                  />
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setReturnModalRecord(null)}
                  className="flex-1 h-10 text-sm font-medium"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={submitReturn}
                  disabled={updateMutation.isPending || !returnStatus}
                  className="flex-1 h-10 text-sm font-semibold text-white"
                  style={{ background: "#ff6c00" }}
                >
                  {updateMutation.isPending ? "Submitting..." : "Confirm Return"}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add New Sub-Model Modal */}
      <AnimatePresence>
        {isAddSubModelOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsAddSubModelOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Add New Sub-Model</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Define a model mapped to matching generator IDs</p>
                </div>
                <button
                  onClick={() => setIsAddSubModelOpen(false)}
                  className="text-gray-400 hover:text-gray-500 rounded-lg p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddSubModelSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Model Name / Number</label>
                    <Input
                      required
                      placeholder="e.g. C7, C8, C9"
                      value={newModelNo}
                      onChange={(e) => setNewModelNo(e.target.value)}
                      className="h-10 border-gray-200 bg-gray-50 focus-visible:ring-[#7c3aed]"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Genset ID Prefix (Starting Characters)</label>
                    <Input
                      required
                      placeholder="e.g. ABC XYZ or EC8, LX8"
                      value={newModelPrefix}
                      onChange={(e) => setNewModelPrefix(e.target.value)}
                      className="h-10 border-gray-200 bg-gray-50 focus-visible:ring-[#7c3aed]"
                    />
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                      Make sure that whatever the Genset ID is, its starting digits or letters match one of these prefixes. You can enter multiple prefixes separated by space or comma.
                    </p>
                  </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => setIsAddSubModelOpen(false)}
                    className="flex-1 h-10 text-sm font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 h-10 text-sm font-semibold text-white"
                    style={{ background: "#7c3aed" }}
                  >
                    Add Model
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Sub-Model Modal */}
      <AnimatePresence>
        {isEditSubModelOpen && editingPanel && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsEditSubModelOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 z-10"
            >
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-gray-900">Edit Sub-Model</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Update the model name or prefix</p>
                </div>
                <button
                  onClick={() => setIsEditSubModelOpen(false)}
                  className="text-gray-400 hover:text-gray-500 rounded-lg p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleEditSubModelSubmit}>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Model Name / Number</label>
                    <input
                      required
                      placeholder="e.g. C7, C8, C9"
                      value={editModelNo}
                      onChange={(e) => setEditModelNo(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Genset ID Prefix (Starting Characters)</label>
                    <input
                      required
                      placeholder="e.g. ABC XYZ or EC8, LX8"
                      value={editModelPrefix}
                      onChange={(e) => setEditModelPrefix(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                      Make sure that whatever the Genset ID is, its starting digits or letters match one of these prefixes. You can enter multiple prefixes separated by space or comma.
                    </p>
                  </div>
                </div>
                <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsEditSubModelOpen(false)}
                    className="flex-1 h-10 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 h-10 text-sm font-semibold text-white rounded-lg transition-colors"
                    style={{ background: "#7c3aed" }}
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }))}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl max-w-sm w-full overflow-hidden border border-gray-100 z-10 p-6"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0 text-red-500">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg text-gray-900 leading-6">{deleteConfirmModal.title}</h3>
                  <p className="text-sm text-gray-500 mt-2 leading-relaxed">{deleteConfirmModal.description}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setDeleteConfirmModal((prev) => ({ ...prev, isOpen: false }))}
                  className="h-10 text-sm font-medium px-4"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={deleteConfirmModal.onConfirm}
                  className="h-10 text-sm font-semibold text-white px-4 bg-red-600 hover:bg-red-700 transition-colors"
                >
                  Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ProfileModal
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        user={user as any}
      />

      {/* ── Sheet Password Modal ── */}
      <AnimatePresence>
        {showSheetPasswordModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={closeSheetPasswordModal}
            />

            {/* Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden border border-gray-100 z-10"
            >
              {/* Header */}
              <div className="px-6 pt-6 pb-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "#fff7ed" }}
                  >
                    <Lock className="w-5 h-5" style={{ color: "#ff6c00" }} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-base leading-tight">Verify Identity</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Enter your password to open the Google Sheet
                    </p>
                  </div>
                  <button
                    onClick={closeSheetPasswordModal}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showSheetPasswordText ? "text" : "password"}
                      placeholder="Enter your password..."
                      value={sheetPassword}
                      onChange={(e) => {
                        setSheetPassword(e.target.value);
                        setSheetPasswordError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") verifyPasswordAndOpenSheet();
                      }}
                      className="h-10 bg-gray-50 border-gray-200 pr-10 focus-visible:ring-[#ff6c00]"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowSheetPasswordText((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showSheetPasswordText
                        ? <EyeOff className="w-4 h-4" />
                        : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {sheetPasswordError && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      {sheetPasswordError}
                    </p>
                  )}
                </div>

                {/* Info note */}
                <div
                  className="flex items-start gap-2 rounded-lg p-3 text-xs"
                  style={{ background: "#fff7ed", color: "#92400e" }}
                >
                  <ExternalLink className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: "#ff6c00" }} />
                  <span>
                    Your Google Sheet will open in a new tab once your password is verified.
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={closeSheetPasswordModal}
                  className="flex-1 h-10 text-sm font-medium"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={verifyPasswordAndOpenSheet}
                  disabled={isVerifyingPassword || !sheetPassword.trim()}
                  className="flex-1 h-10 text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: "#ff6c00" }}
                >
                  {isVerifyingPassword ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-3.5 h-3.5" />
                      Open Sheet
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Download & Print Modal */}
      <AnimatePresence>
        {isDownloadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsDownloadModalOpen(false)}
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 z-10 flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
                    <Download className="w-5 h-5 text-orange-500" />
                    Download & Print Data
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">Export your generator records or prepare them for printing</p>
                </div>
                <button
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="text-gray-400 hover:text-gray-500 rounded-lg p-1 hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1">
                {/* 1. Filter Scope selection */}
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Select Data Scope</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setDownloadFilterScope("filtered")}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${downloadFilterScope === "filtered"
                        ? "border-orange-500 bg-orange-50/50 text-orange-900 shadow-sm"
                        : "border-gray-200 hover:bg-gray-50 text-gray-700"
                        }`}
                    >
                      <span className="text-xs font-bold">Filtered Table</span>
                      <span className="text-[10px] text-gray-400">({generators.length} records)</span>
                    </button>

                    <button
                      type="button"
                      disabled={selectedRecordIds.size === 0}
                      onClick={() => setDownloadFilterScope("selected")}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${downloadFilterScope === "selected"
                        ? "border-orange-500 bg-orange-50/50 text-orange-900 shadow-sm"
                        : "border-gray-200 hover:bg-gray-50 text-gray-700"
                        }`}
                    >
                      <span className="text-xs font-bold">Selected Rows</span>
                      <span className="text-[10px] text-gray-400">({selectedRecordIds.size} records)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDownloadFilterScope("custom")}
                      className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 ${downloadFilterScope === "custom"
                        ? "border-orange-500 bg-orange-50/50 text-orange-900 shadow-sm"
                        : "border-gray-200 hover:bg-gray-50 text-gray-700"
                        }`}
                    >
                      <span className="text-xs font-bold">Custom Filters</span>
                      <span className="text-[10px] text-gray-400 font-medium">Specify below</span>
                    </button>
                  </div>
                </div>

                {/* 2. Custom filters area */}
                {downloadFilterScope === "custom" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="space-y-4 pt-2 border-t border-gray-100"
                  >
                    {/* Date filter type */}
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">1. Date Filter</label>
                      <div className="grid grid-cols-3 gap-2">
                        {["all", "today", "range"].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setDownloadFilterDateType(type as any)}
                            className={`py-1.5 px-3 rounded-lg border text-xs font-semibold capitalize transition-all ${downloadFilterDateType === type
                              ? "border-orange-500 bg-orange-50/30 text-orange-700"
                              : "border-gray-200 hover:bg-gray-50 text-gray-600"
                              }`}
                          >
                            {type === "all" ? "All Dates" : type === "today" ? "Today Only" : "Custom Range"}
                          </button>
                        ))}
                      </div>

                      {downloadFilterDateType === "range" && (
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <div>
                            <span className="text-[11px] text-gray-500 font-medium block mb-1">Start Date</span>
                            <Input
                              type="date"
                              value={downloadStartDate}
                              onChange={(e) => setDownloadStartDate(e.target.value)}
                              className="h-9 text-xs bg-gray-50 border-gray-200 font-sans"
                            />
                          </div>
                          <div>
                            <span className="text-[11px] text-gray-500 font-medium block mb-1">End Date</span>
                            <Input
                              type="date"
                              value={downloadEndDate}
                              onChange={(e) => setDownloadEndDate(e.target.value)}
                              className="h-9 text-xs bg-gray-50 border-gray-200 font-sans"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Model filter */}
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">2. Model / Panel Filter</label>
                      <Select value={downloadFilterModel} onValueChange={setDownloadFilterModel}>
                        <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                          <SelectValue placeholder="All Models" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Models</SelectItem>
                          <SelectItem value="Other">Other (Unassigned)</SelectItem>
                          {panels.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Status filter */}
                    <div>
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-1.5">3. Status Filter</label>
                      <Select value={downloadFilterStatus} onValueChange={setDownloadFilterStatus}>
                        <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                          <SelectValue placeholder="All Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>{status}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </motion.div>
                )}

                {/* Info summary */}
                <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center text-xs border border-gray-100">
                  <span className="text-gray-500 font-medium">Records that will be exported:</span>
                  <span className="font-extrabold text-sm text-gray-900 bg-white border px-3 py-1 rounded-lg">
                    {getExportData().length}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex gap-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setIsDownloadModalOpen(false)}
                  className="flex-1 h-11 text-sm font-medium"
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  onClick={handlePrint}
                  className="flex-1 h-11 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </Button>

                <Button
                  type="button"
                  onClick={handleDownloadPDF}
                  className="flex-1 h-11 text-sm font-semibold text-white flex items-center justify-center gap-1.5 shadow-sm"
                  style={{ background: "#ff6c00" }}
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
