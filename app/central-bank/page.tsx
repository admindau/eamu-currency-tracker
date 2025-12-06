"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

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

type AdminHistoryPoint = {
  date: string;
  mid: number;
};

/**
 * Utility: turn manual_fixings rows into CSV and trigger a download in the browser.
 */
function downloadManualFixingsCsv(
  rows: ManualOverrideRow[],
  filename: string
) {
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

  function toCsvValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    const str = String(value);
    if (/[\", \n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

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

/**
 * Format date like: 2025-12-07 (Monday)
 */
function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return dateStr;
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  return `${dateStr} (${weekday})`;
}

/**
 * Admin analytics panel: pulls USD/SSP history and shows it with range selector.
 * History source: /api/v1/rates/history?base=SSP&quote=USD&days=...
 */
function AdminAnalyticsPanel({
  overrides,
}: {
  overrides: ManualOverrideRow[];
}) {
  const [range, setRange] = useState<"90d" | "365d" | "all">("365d");
  const [history, setHistory] = useState<AdminHistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const days =
          range === "90d" ? 90 : range === "365d" ? 365 : 3650; // "all" ≈ long window

        const res = await fetch(
          `/api/v1/rates/history?base=SSP&quote=USD&days=${days}`
        );
        if (!active) return;

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = await res.json();
        const raw = (json?.data ?? json ?? []) as any[];

        const mapped: AdminHistoryPoint[] = raw
          .map((p) => {
            const date =
              p.as_of_date ??
              p.date ??
              p.as_of ??
              p.fixing_date ??
              "";
            const mid = Number(
              p.rate_mid ?? p.mid ?? p.value ?? p.close ?? 0
            );
            if (!date || !Number.isFinite(mid)) return null;
            return { date, mid };
          })
          .filter(Boolean) as AdminHistoryPoint[];

        setHistory(mapped);
      } catch (err: any) {
        console.error("Failed to load admin history:", err);
        setError(
          err?.message ??
            "Failed to load history from /api/v1/rates/history."
        );
        setHistory([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [range]);

  const firstDate = history[0]?.date;
  const lastDate = history[history.length - 1]?.date;

  const overridesInRange = overrides.filter((o) => {
    if (!firstDate || !lastDate) return false;
    return (
      o.base_currency === "SSP" &&
      o.quote_currency === "USD" &&
      o.as_of_date >= firstDate &&
      o.as_of_date <= lastDate
    );
  });

  const data = {
    labels: history.map((p) => p.date),
    datasets: [
      {
        label: "USD/SSP mid",
        data: history.map((p) => p.mid),
        borderColor: "rgba(244,244,245,0.9)",
        backgroundColor: "rgba(24,24,27,0.8)",
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.15,
      },
    ],
  };

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        intersect: false,
        mode: "index",
        callbacks: {
          label: (ctx: any) => {
            const v = ctx.parsed.y;
            if (!Number.isFinite(v)) return "";
            return `USD/SSP mid: ${v.toLocaleString("en-US", {
              maximumFractionDigits: 3,
            })}`;
          },
        },
      },
    },
    scales: {
      x: {
        ticks: {
          maxTicksLimit: 6,
          color: "#71717a",
          font: { size: 10 },
        },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: "#71717a",
          font: { size: 10 },
        },
        grid: { color: "rgba(39,39,42,0.6)" },
      },
    },
  };

  const rangeLabel =
    range === "90d"
      ? "last 90 days"
      : range === "365d"
      ? "last 365 days"
      : "full available history";

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
            Admin analytics
          </p>
          <p className="text-sm text-zinc-400">
            Volatility and anchor-pair history for USD/SSP, using live engine
            data.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 text-[0.7rem]">
          <div className="inline-flex rounded-full bg-zinc-900/70 p-1">
            {(
              [
                ["90d", "90d"],
                ["365d", "365d"],
                ["All", "all"],
              ] as const
            ).map(([label, value]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`px-2.5 py-1 rounded-full ${
                  range === value
                    ? "bg-emerald-500 text-black"
                    : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[0.65rem] text-zinc-500">
            Viewing {rangeLabel}.
          </p>
        </div>
      </div>

      <div className="h-44 rounded-xl border border-zinc-900 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 px-2 py-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-[0.75rem] text-zinc-500">
            Loading history…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-[0.75rem] text-red-400">
            {error}
          </div>
        ) : history.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[0.75rem] text-zinc-500">
            No history data returned yet.
          </div>
        ) : (
          <Line data={data} options={options} />
        )}
      </div>

      <p className="text-[0.7rem] text-zinc-500">
        In this window, the system has{" "}
        <span className="text-zinc-200 font-medium">
          {overridesInRange.length}
        </span>{" "}
        manual USD/SSP overrides captured in{" "}
        <code className="rounded bg-zinc-900 px-1 py-0.5">
          manual_fixings
        </code>
        . In a later phase, we can overlay these on the chart as markers to
        visualise impact.
      </p>
    </div>
  );
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

  // Fixing schedule state
  const [schedule, setSchedule] = useState<FixingScheduleRow | null>(null);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // Fixing schedule form fields
  const today = new Date().toISOString().slice(0, 10);
  const [scheduleDate, setScheduleDate] = useState(today);
  const [scheduleWindow, setScheduleWindow] = useState(
    "Normal fixing window"
  );
  const [scheduleNotes, setScheduleNotes] = useState("");

  // Manual fixing form fields
  const [formDate, setFormDate] = useState(today);
  const [formBase, setFormBase] = useState("SSP");
  const [formQuote, setFormQuote] = useState("USD");
  const [formRate, setFormRate] = useState("");
  const [formOfficial, setFormOfficial] = useState(true);
  const [formOverride, setFormOverride] = useState(false);
  const [formNotes, setFormNotes] = useState("");

  // 1) Load authenticated user
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

  // 2) Load manual fixings from Supabase (once user is available)
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
          const normalised: ManualOverrideRow[] = (data ?? []).map(
            (row) => ({
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
            })
          );
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

  // 3) Load fixing schedule once user is available
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

  async function handleCreateManualFixing(e: FormEvent) {
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

      setFormRate("");
      setFormNotes("");
      setFormOfficial(true);
      setFormOverride(false);
      setShowForm(false);
    } catch (err: any) {
      console.error("Unexpected insert error:", err);
      setFormError("Unexpected error while saving.");
    } finally {
      setSavingForm(false);
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
        <p className="text-xs text-zinc-500">
          Checking Central Bank session…
        </p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-8">
        {/* Top bar */}
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
              analytics. Not visible on the public interface.
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

        {/* Layout grid */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.1fr)]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Manual overrides */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Manual fixings &amp; overrides
                  </p>
                  <p className="text-sm text-zinc-400">
                    View and manage rates that differ from the engine&apos;s
                    computed fixing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="rounded-full bg-emerald-500 px-3 py-1.5 text-[0.75rem] font-medium text-black hover:bg-emerald-400"
                >
                  + Add manual fixing
                </button>
              </div>

              {/* Inline create form */}
              {showForm && (
                <form
                  onSubmit={handleCreateManualFixing}
                  className="rounded-xl border border-zinc-800 bg-black/70 p-3 space-y-3 text-xs"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-[0.7rem] text-zinc-400">
                        Fixing date
                      </label>
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[0.7rem] text-zinc-400">
                        Base / quote
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={formBase}
                          onChange={(e) =>
                            setFormBase(e.target.value.toUpperCase())
                          }
                          className="w-1/2 rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                        />
                        <input
                          type="text"
                          value={formQuote}
                          onChange={(e) =>
                            setFormQuote(e.target.value.toUpperCase())
                          }
                          className="w-1/2 rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[0.7rem] text-zinc-400">
                      Mid rate
                    </label>
                    <input
                      type="text"
                      value={formRate}
                      onChange={(e) => setFormRate(e.target.value)}
                      placeholder="e.g. 4550.644"
                      className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-[0.7rem]">
                    <label className="inline-flex items-center gap-1 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={formOfficial}
                        onChange={(e) => setFormOfficial(e.target.checked)}
                        className="h-3 w-3 rounded border-zinc-700 bg-black"
                      />
                      Official fixing
                    </label>
                    <label className="inline-flex items-center gap-1 text-zinc-300">
                      <input
                        type="checkbox"
                        checked={formOverride}
                        onChange={(e) => setFormOverride(e.target.checked)}
                        className="h-3 w-3 rounded border-zinc-700 bg-black"
                      />
                      Manual override
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[0.7rem] text-zinc-400">
                      Notes (optional)
                    </label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      placeholder="Reason for override, board approval ref, etc."
                    />
                  </div>

                  {formError && (
                    <p className="text-[0.7rem] text-red-400">{formError}</p>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (!savingForm) {
                          setShowForm(false);
                          setFormError(null);
                        }
                      }}
                      className="text-[0.7rem] text-zinc-400 hover:text-zinc-100"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingForm}
                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-[0.75rem] font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {savingForm ? "Saving…" : "Save fixing"}
                    </button>
                  </div>
                </form>
              )}

              <div className="rounded-xl border border-zinc-900 bg-black/60 overflow-hidden text-xs">
                <div className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.9fr] bg-zinc-950/90 text-[0.7rem] text-zinc-400">
                  <div className="px-3 py-2">Date &amp; pair</div>
                  <div className="px-3 py-2 text-right">Mid rate</div>
                  <div className="px-3 py-2 text-right">Official</div>
                  <div className="px-3 py-2 text-right">Override</div>
                  <div className="px-3 py-2 text-right">Created by</div>
                </div>

                <div className="max-h-56 overflow-y-auto">
                  {loadingOverrides ? (
                    <div className="px-3 py-4 text-[0.75rem] text-zinc-500">
                      Loading manual fixings…
                    </div>
                  ) : overridesError ? (
                    <div className="px-3 py-4 text-[0.75rem] text-red-400">
                      {overridesError}
                    </div>
                  ) : overrides.length === 0 ? (
                    <div className="px-3 py-4 text-[0.75rem] text-zinc-500">
                      No manual fixings yet. Use &quot;Add manual fixing&quot;
                      to register one.
                    </div>
                  ) : (
                    overrides.map((row) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.9fr] border-t border-zinc-900/80 px-3 py-2"
                      >
                        <div>
                          <p className="text-zinc-100">{row.as_of_date}</p>
                          <p className="text-[0.7rem] text-zinc-500">
                            {row.base_currency}/{row.quote_currency}
                          </p>
                        </div>
                        <div className="text-right text-zinc-100">
                          {row.rate_mid.toLocaleString("en-US", {
                            maximumFractionDigits: 6,
                          })}
                        </div>
                        <div className="text-right text-[0.7rem]">
                          {row.is_official ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-400">
                              Yes
                            </span>
                          ) : (
                            <span className="text-zinc-600">No</span>
                          )}
                        </div>
                        <div className="text-right text-[0.7rem]">
                          {row.is_manual_override ? (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-400">
                              Override
                            </span>
                          ) : (
                            <span className="text-zinc-600">No</span>
                          )}
                        </div>
                        <div className="text-right text-[0.7rem] text-zinc-500">
                          {row.created_email ?? "—"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                Data in this table is stored in the Supabase{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  manual_fixings
                </code>{" "}
                table. Later we can let the FX engine read from this table to
                override or annotate its own computed fixings.
              </p>
            </div>

            {/* Export panel */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Data export
                  </p>
                  <p className="text-sm text-zinc-400">
                    Export your manual fixings to CSV / Excel for reporting and
                    backup.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    downloadManualFixingsCsv(
                      overrides,
                      "manual_fixings_overrides.csv"
                    )
                  }
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export overrides (CSV)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadManualFixingsCsv(
                      overrides,
                      "manual_fixings_overrides_excel.csv"
                    )
                  }
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export overrides (Excel)
                </button>
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                These exports currently include data from{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  manual_fixings
                </code>{" "}
                only. In a later phase, we can also hook this panel into the
                main FX engine export endpoints for full market history.
              </p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Admin analytics chart */}
            <AdminAnalyticsPanel overrides={overrides} />

            {/* Fixing schedule */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Fixing schedule
                  </p>
                  <p className="text-sm text-zinc-400">
                    Keep track of upcoming fixing days and any special
                    instructions.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSchedule((prev) => !prev);
                    setScheduleError(null);
                    if (schedule) {
                      setScheduleDate(schedule.next_fixing_date);
                      setScheduleWindow(
                        schedule.window_label ?? "Normal fixing window"
                      );
                      setScheduleNotes(schedule.notes ?? "");
                    }
                  }}
                  className="rounded-full border border-zinc-700 bg-black px-3 py-1.5 text-[0.75rem] text-zinc-100 hover:bg-zinc-900"
                >
                  {editingSchedule ? "Close editor" : "Edit schedule"}
                </button>
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/60 p-3 text-xs space-y-3">
                {loadingSchedule ? (
                  <p className="text-[0.75rem] text-zinc-500">
                    Loading schedule…
                  </p>
                ) : scheduleError ? (
                  <p className="text-[0.75rem] text-red-400">
                    {scheduleError}
                  </p>
                ) : schedule ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Next fixing date</span>
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.75rem] text-emerald-400">
                        {schedule.window_label ?? "Normal fixing window"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[0.8rem]">
                      <div>
                        <p className="text-zinc-500">Configured</p>
                        <p className="text-zinc-100">
                          {formatDateWithWeekday(schedule.next_fixing_date)}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500">Notes</p>
                        <p className="text-zinc-100">
                          {schedule.notes ?? "No special instructions."}
                        </p>
                      </div>
                    </div>
                    {schedule.created_email && (
                      <p className="text-[0.7rem] text-zinc-500">
                        Last updated by{" "}
                          <span className="text-zinc-300">
                            {schedule.created_email}
                          </span>
                        .
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-[0.75rem] text-zinc-500">
                    No schedule configured yet. Use &quot;Edit schedule&quot; to
                    set the next fixing date.
                  </p>
                )}

                {editingSchedule && (
                  <form
                    onSubmit={handleSaveSchedule}
                    className="mt-2 space-y-2 border-t border-zinc-900 pt-3"
                  >
                    <div className="space-y-1">
                      <label className="text-[0.7rem] text-zinc-400">
                        Next fixing date
                      </label>
                      <input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[0.7rem] text-zinc-400">
                        Window label
                      </label>
                      <input
                        type="text"
                        value={scheduleWindow}
                        onChange={(e) => setScheduleWindow(e.target.value)}
                        placeholder="Normal fixing window"
                        className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[0.7rem] text-zinc-400">
                        Notes (optional)
                      </label>
                      <textarea
                        value={scheduleNotes}
                        onChange={(e) => setScheduleNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                        placeholder="e.g. Holiday adjustments, board instructions, etc."
                      />
                    </div>

                    {scheduleError && (
                      <p className="text-[0.7rem] text-red-400">
                        {scheduleError}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSchedule(false);
                          setScheduleError(null);
                        }}
                        className="text-[0.7rem] text-zinc-400 hover:text-zinc-100"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingSchedule}
                        className="rounded-full bg-emerald-500 px-3 py-1.5 text-[0.75rem] font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {savingSchedule ? "Saving…" : "Save schedule"}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                This card is backed by the{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  fixing_schedule
                </code>{" "}
                table in Supabase. Use it to keep the official fixing calendar
                in sync with market communications.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
