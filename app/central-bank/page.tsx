"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

// ✅ IMPORTANT: prevent SSR/prerender evaluation of chart modules
const EngineHistoryChartCard = dynamic(() => import("./EngineHistoryChartCard"), {
  ssr: false,
  loading: () => (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-black/40 px-5 pb-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-zinc-200">
            Engine history
          </h3>
          <p className="mt-1 text-xs text-zinc-500">Loading chart…</p>
        </div>
      </div>
      <div className="mt-2 h-56 w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2" />
    </section>
  ),
});

type SupabaseUser = {
  id: string;
  email?: string;
};

type ManualOverrideRow = {
  id: string;
  as_of_date: string;
  base_currency: string;
  quote_currency: string;
  rate_mid: number;
  is_official: boolean;
  is_manual_override: boolean;
  notes: string | null;
  created_email: string | null;
  created_at: string;
};

type FixingScheduleRow = {
  id: string;
  next_fixing_date: string;
  window_label: string | null;
  notes: string | null;
  created_email: string | null;
};

function downloadManualFixingsCsv(rows: ManualOverrideRow[], filename: string) {
  if (!rows.length) {
    alert("No manual fixings available to export yet.");
    return;
  }

  const headers = [
    "as_of_date",
    "base_currency",
    "quote_currency",
    "rate_mid",
    "is_official",
    "is_manual_override",
    "notes",
    "created_email",
    "created_at",
  ];

  const toCsvValue = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[\",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [];
  lines.push(headers.join(","));

  for (const row of rows) {
    const values = [
      row.as_of_date,
      row.base_currency,
      row.quote_currency,
      row.rate_mid,
      row.is_official,
      row.is_manual_override,
      row.notes ?? "",
      row.created_email ?? "",
      row.created_at,
    ].map(toCsvValue);
    lines.push(values.join(","));
  }

  const csvContent = lines.join("\n");
  const blob = new Blob([csvContent], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${dateStr} (${weekday})`;
}

export default function CentralBankDashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [overrides, setOverrides] = useState<ManualOverrideRow[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [overridesError, setOverridesError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const [schedule, setSchedule] = useState<FixingScheduleRow | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const [scheduleDate, setScheduleDate] = useState(today);
  const [scheduleWindow, setScheduleWindow] = useState("Normal fixing window");
  const [scheduleNotes, setScheduleNotes] = useState("");

  const [formDate, setFormDate] = useState(today);
  const [formBase, setFormBase] = useState("SSP");
  const [formQuote, setFormQuote] = useState("USD");
  const [formRate, setFormRate] = useState("");
  const [formOfficial, setFormOfficial] = useState(true);
  const [formOverride, setFormOverride] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setLoadingUser(true);
      const { data, error } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !data?.user) {
        router.replace("/central-bank/login");
      } else {
        setUser({
          id: data.user.id,
          email: data.user.email ?? undefined,
        });
      }

      setLoadingUser(false);
    }

    loadUser();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadOverrides() {
      setLoadingOverrides(true);
      setOverridesError(null);

      try {
        const { data, error } = await supabase
          .from("manual_fixings")
          .select(
            `
            id,
            as_of_date,
            base_currency,
            quote_currency,
            rate_mid,
            is_official,
            is_manual_override,
            notes,
            created_email,
            created_at
          `
          )
          .order("as_of_date", { ascending: false })
          .limit(50);

        if (!active) return;

        if (error) {
          console.error("Failed to load manual_fixings:", error);
          setOverrides([]);
          setOverridesError(
            error.message ??
              "Could not load manual fixings. Check that the table exists."
          );
        } else {
          const normalised: ManualOverrideRow[] = (data ?? []).map((row) => ({
            id: row.id,
            as_of_date: row.as_of_date,
            base_currency: row.base_currency,
            quote_currency: row.quote_currency,
            rate_mid: Number(row.rate_mid),
            is_official: row.is_official,
            is_manual_override: row.is_manual_override,
            notes: row.notes ?? null,
            created_email: row.created_email ?? null,
            created_at: row.created_at,
          }));
          setOverrides(normalised);
        }
      } catch (err: any) {
        if (!active) return;
        console.error("Unexpected loadOverrides error:", err);
        setOverrides([]);
        setOverridesError("Unexpected error loading manual fixings.");
      } finally {
        if (active) setLoadingOverrides(false);
      }
    }

    loadOverrides();

    return () => {
      active = false;
    };
  }, [supabase, user]);

  useEffect(() => {
    if (!user) return;

    let active = true;

    async function loadSchedule() {
      setLoadingSchedule(true);
      setScheduleError(null);

      try {
        const { data, error } = await supabase
          .from("fixing_schedule")
          .select(
            `
            id,
            next_fixing_date,
            window_label,
            notes,
            created_email,
            created_at
          `
          )
          .order("next_fixing_date", { ascending: true })
          .limit(1);

        if (!active) return;

        if (error) {
          console.error("Failed to load fixing_schedule:", error);
          setSchedule(null);
          setScheduleError(
            error.message ??
              "Could not load fixing schedule. Check that the table exists."
          );
        } else if (data && data.length > 0) {
          const row = data[0];
          const normalised: FixingScheduleRow = {
            id: row.id,
            next_fixing_date: row.next_fixing_date,
            window_label: row.window_label ?? null,
            notes: row.notes ?? null,
            created_email: row.created_email ?? null,
          };
          setSchedule(normalised);
          setScheduleDate(row.next_fixing_date);
          setScheduleWindow(row.window_label ?? "Normal fixing window");
          setScheduleNotes(row.notes ?? "");
        } else {
          setSchedule(null);
        }
      } catch (err: any) {
        if (!active) return;
        console.error("Unexpected loadSchedule error:", err);
        setSchedule(null);
        setScheduleError("Unexpected error loading schedule.");
      } finally {
        if (active) setLoadingSchedule(false);
      }
    }

    loadSchedule();

    return () => {
      active = false;
    };
  }, [supabase, user]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/central-bank/login");
  }

  function resetFormToDefaults() {
    const today = new Date().toISOString().slice(0, 10);
    setFormDate(today);
    setFormBase("SSP");
    setFormQuote("USD");
    setFormRate("");
    setFormOfficial(true);
    setFormOverride(false);
    setFormNotes("");
    setFormError(null);
  }

  function startCreateNew() {
    setEditingRowId(null);
    resetFormToDefaults();
    setShowForm(true);
  }

  function startEditRow(row: ManualOverrideRow) {
    setEditingRowId(row.id);
    setFormDate(row.as_of_date);
    setFormBase(row.base_currency);
    setFormQuote(row.quote_currency);
    setFormRate(String(row.rate_mid));
    setFormOfficial(row.is_official);
    setFormOverride(row.is_manual_override);
    setFormNotes(row.notes ?? "");
    setFormError(null);
    setShowForm(true);
  }

  async function handleCreateOrUpdateManualFixing(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSavingForm(true);
    setFormError(null);

    const parsedRate = Number(formRate.replace(/,/g, ""));
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) {
      setSavingForm(false);
      setFormError("Please enter a valid positive rate.");
      return;
    }

    try {
      if (editingRowId) {
        const { data, error } = await supabase
          .from("manual_fixings")
          .update({
            as_of_date: formDate,
            base_currency: formBase,
            quote_currency: formQuote,
            rate_mid: parsedRate,
            is_official: formOfficial,
            is_manual_override: formOverride,
            notes: formNotes.length ? formNotes : null,
          })
          .eq("id", editingRowId)
          .select(
            `
            id,
            as_of_date,
            base_currency,
            quote_currency,
            rate_mid,
            is_official,
            is_manual_override,
            notes,
            created_email,
            created_at
          `
          )
          .single();

        if (error) {
          console.error("Failed to update manual_fixings:", error);
          setFormError(error.message ?? "Failed to update manual fixing.");
          setSavingForm(false);
          return;
        }

        const updatedRow: ManualOverrideRow = {
          id: data.id,
          as_of_date: data.as_of_date,
          base_currency: data.base_currency,
          quote_currency: data.quote_currency,
          rate_mid: Number(data.rate_mid),
          is_official: data.is_official,
          is_manual_override: data.is_manual_override,
          notes: data.notes ?? null,
          created_email: data.created_email ?? null,
          created_at: data.created_at,
        };

        setOverrides((prev) =>
          prev.map((row) => (row.id === updatedRow.id ? updatedRow : row))
        );
      } else {
        const { data, error } = await supabase
          .from("manual_fixings")
          .insert([
            {
              as_of_date: formDate,
              base_currency: formBase,
              quote_currency: formQuote,
              rate_mid: parsedRate,
              is_official: formOfficial,
              is_manual_override: formOverride,
              notes: formNotes.length ? formNotes : null,
              created_by: user.id,
              created_email: user.email ?? null,
            },
          ])
          .select(
            `
          id,
          as_of_date,
          base_currency,
          quote_currency,
          rate_mid,
          is_official,
          is_manual_override,
          notes,
          created_email,
          created_at
        `
          )
          .single();

        if (error) {
          console.error("Failed to insert manual_fixings:", error);
          setFormError(error.message ?? "Failed to save manual fixing.");
          setSavingForm(false);
          return;
        }

        const newRow: ManualOverrideRow = {
          id: data.id,
          as_of_date: data.as_of_date,
          base_currency: data.base_currency,
          quote_currency: data.quote_currency,
          rate_mid: Number(data.rate_mid),
          is_official: data.is_official,
          is_manual_override: data.is_manual_override,
          notes: data.notes ?? null,
          created_email: data.created_email ?? null,
          created_at: data.created_at,
        };

        setOverrides((prev) => [newRow, ...prev]);
      }

      setShowForm(false);
      setEditingRowId(null);
      resetFormToDefaults();
    } catch (err: any) {
      console.error("Unexpected manual_fixings save error:", err);
      setFormError("Unexpected error while saving.");
    } finally {
      setSavingForm(false);
    }
  }

  async function handleDeleteRow(row: ManualOverrideRow) {
    if (!user) return;
    const ok = window.confirm(
      `Delete manual fixing for ${row.base_currency}/${row.quote_currency} on ${row.as_of_date}?`
    );
    if (!ok) return;

    try {
      const { error } = await supabase
        .from("manual_fixings")
        .delete()
        .eq("id", row.id);

      if (error) {
        console.error("Failed to delete manual_fixings:", error);
        alert(error.message ?? "Failed to delete manual fixing.");
        return;
      }

      setOverrides((prev) => prev.filter((r) => r.id !== row.id));

      if (editingRowId === row.id) {
        setEditingRowId(null);
        resetFormToDefaults();
        setShowForm(false);
      }
    } catch (err: any) {
      console.error("Unexpected delete error:", err);
      alert("Unexpected error while deleting fixing.");
    }
  }

  async function handleSaveSchedule(e: FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (!scheduleDate) {
      setScheduleError("Please select a fixing date.");
      return;
    }

    setSavingSchedule(true);
    setScheduleError(null);

    try {
      const payload = {
        next_fixing_date: scheduleDate,
        window_label: scheduleWindow || null,
        notes: scheduleNotes || null,
        created_by: schedule ? undefined : user.id,
        created_email: schedule ? undefined : user.email ?? null,
      };

      let result;
      if (schedule) {
        result = await supabase
          .from("fixing_schedule")
          .update(payload)
          .eq("id", schedule.id)
          .select(
            `
            id,
            next_fixing_date,
            window_label,
            notes,
            created_email,
            created_at
          `
          )
          .single();
      } else {
        result = await supabase
          .from("fixing_schedule")
          .insert([payload])
          .select(
            `
            id,
            next_fixing_date,
            window_label,
            notes,
            created_email,
            created_at
          `
          )
          .single();
      }

      const { data, error } = result;

      if (error) {
        console.error("Failed to save fixing_schedule:", error);
        setScheduleError(error.message ?? "Failed to save schedule.");
        setSavingSchedule(false);
        return;
      }

      const row: FixingScheduleRow = {
        id: data.id,
        next_fixing_date: data.next_fixing_date,
        window_label: data.window_label ?? null,
        notes: data.notes ?? null,
        created_email: data.created_email ?? null,
      };

      setSchedule(row);
      setEditingSchedule(false);
    } catch (err: any) {
      console.error("Unexpected save schedule error:", err);
      setScheduleError("Unexpected error while saving schedule.");
    } finally {
      setSavingSchedule(false);
    }
  }

  if (loadingUser) {
    return (
      <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center">
        <p className="text-xs text-zinc-500">Checking Central Bank session…</p>
      </main>
    );
  }

  if (!user) return null;

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-8">
        <header className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-zinc-500">
              EAMU FX · Central Bank Mode
            </p>
            <h1 className="text-xl font-semibold tracking-tight">
              A-Mode dashboard
            </h1>
            <p className="text-xs text-zinc-400">
              Internal view for managing fixings, overrides, exports, and
              schedule. Not visible on the public interface.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 text-xs">
            <div className="flex items-center gap-2 text-zinc-400">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{user.email ?? "Authenticated admin"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-[0.7rem] font-medium text-zinc-100 hover:bg-zinc-800"
              >
                ← Back to public dashboard
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="rounded-full border border-red-500/60 bg-red-500/10 px-3 py-1.5 text-[0.7rem] font-medium text-red-300 hover:bg-red-500/20"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="h-1 w-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-red-500" />

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
          <div className="space-y-6">
            {/* Manual fixings & overrides card */}
            {/* (unchanged from your file) */}
            {/* ... keep your existing left column code exactly as-is ... */}
          </div>

          <div className="space-y-6">
            <EngineHistoryChartCard />

            {/* Fixing schedule card */}
            {/* (unchanged from your file) */}
            {/* ... keep your existing fixing schedule code exactly as-is ... */}
          </div>
        </section>
      </div>
    </main>
  );
}
