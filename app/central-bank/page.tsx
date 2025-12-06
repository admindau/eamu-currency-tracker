"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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

  const today = new Date().toISOString().slice(0, 10);

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
    if (!user) return; // wait for auth

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

      // Prepend to list
      setOverrides((prev) => [newRow, ...prev]);

      // Reset form
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
                          onChange={(e) => setFormBase(e.target.value.toUpperCase())}
                          className="w-1/2 rounded-lg border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                        />
                        <input
                          type="text"
                          value={formQuote}
                          onChange={(e) => setFormQuote(e.target.value.toUpperCase())}
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

            {/* Export panel (still conceptual for now) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Data export
                  </p>
                  <p className="text-sm text-zinc-400">
                    Pull engine data into CSV/Excel for offline analysis and
                    sharing.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "Next step: wire this to /api/v1/export/rates or a dedicated admin export endpoint."
                    );
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export recent rates (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert("Excel export will be added in the next phase.");
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export recent rates (Excel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "Override export will pull from the manual_fixings table in a later phase."
                    );
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export overrides
                </button>
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                Suggestion: reuse the existing{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  /api/v1/export/rates
                </code>{" "}
                endpoint for CSV and add a dedicated overrides export powered by
                the{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  manual_fixings
                </code>{" "}
                table.
              </p>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Admin-only charts placeholder */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[0.65rem] uppercase tracking-[0.2em] text-zinc-500">
                    Admin analytics
                  </p>
                  <p className="text-sm text-zinc-400">
                    Volatility, override impact, and trend diagnostics for the
                    anchor pair.
                  </p>
                </div>
              </div>

              <div className="h-40 rounded-xl border border-zinc-900 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 flex items-center justify-center text-[0.75rem] text-zinc-500">
                Chart area reserved for admin-only visualisations
                (volatility bands, override vs engine, etc.).
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                Next phase: pull long-horizon history from the engine and
                overlay manual fixings from{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  manual_fixings
                </code>{" "}
                to show impact.
              </p>
            </div>

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
                  className="rounded-full border border-zinc-700 bg-black px-3 py-1.5 text-[0.75rem] text-zinc-100 hover:bg-zinc-900"
                >
                  Edit schedule
                </button>
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/60 p-3 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Next fixing date</span>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.75rem] text-emerald-400">
                    Placeholder: configure from admin API
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[0.8rem]">
                  <div>
                    <p className="text-zinc-500">Example</p>
                    <p className="text-zinc-100">2025-12-07 (Monday)</p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Notes</p>
                    <p className="text-zinc-100">
                      Normal fixing window. No holidays expected.
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                We&apos;ll back this card with a small Supabase table (e.g.
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  fixing_schedule
                </code>
                ) and an editor UI so the bank can manage its calendar
                centrally.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
