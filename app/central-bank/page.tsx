"use client";

import { useEffect, useState } from "react";
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
  created_by?: string | null;
};

export default function CentralBankDashboardPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [overrides, setOverrides] = useState<ManualOverrideRow[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadUser() {
      setLoadingUser(true);
      const { data, error } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error || !data?.user) {
        // Not logged in → push to login page
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
    let active = true;

    async function loadOverrides() {
      setLoadingOverrides(true);

      try {
        // TODO: Wire this to a real admin endpoint once ready.
        // For now, we keep a safe placeholder with no network call
        // to avoid 404 noise in the console.
        const mock: ManualOverrideRow[] = [
          {
            id: "example-1",
            as_of_date: "2025-12-06",
            base_currency: "SSP",
            quote_currency: "USD",
            rate_mid: 4550.644,
            is_official: true,
            is_manual_override: false,
            created_by: "central.bank@example.gov",
          },
        ];

        if (active) {
          setOverrides(mock);
        }
      } catch (err) {
        console.error("Failed to load manual overrides:", err);
        if (active) setOverrides([]);
      } finally {
        if (active) setLoadingOverrides(false);
      }
    }

    loadOverrides();

    return () => {
      active = false;
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/central-bank/login");
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
    // We already redirected above, but this keeps TS and render happy.
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
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3">
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
                  className="rounded-full bg-emerald-500 px-3 py-1.5 text-[0.75rem] font-medium text-black hover:bg-emerald-400"
                >
                  + Add manual fixing
                </button>
              </div>

              <div className="rounded-xl border border-zinc-900 bg-black/60 overflow-hidden text-xs">
                <div className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.7fr] bg-zinc-950/90 text-[0.7rem] text-zinc-400">
                  <div className="px-3 py-2">Date &amp; pair</div>
                  <div className="px-3 py-2 text-right">Mid rate</div>
                  <div className="px-3 py-2 text-right">Official</div>
                  <div className="px-3 py-2 text-right">Override</div>
                  <div className="px-3 py-2 text-right">Created by</div>
                </div>

                <div className="max-h-56 overflow-y-auto">
                  {loadingOverrides ? (
                    <div className="px-3 py-4 text-[0.75rem] text-zinc-500">
                      Loading overrides…
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
                        className="grid grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr_0.7fr] border-t border-zinc-900/80 px-3 py-2"
                      >
                        <div>
                          <p className="text-zinc-100">{row.as_of_date}</p>
                          <p className="text-[0.7rem] text-zinc-500">
                            {row.base_currency}/{row.quote_currency}
                          </p>
                        </div>
                        <div className="text-right text-zinc-100">
                          {row.rate_mid.toLocaleString("en-US", {
                            maximumFractionDigits: 4,
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
                          {row.created_by ?? "—"}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <p className="text-[0.7rem] text-zinc-500">
                TODO: Wire this table to the real{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  /api/admin/manual-rate
                </code>{" "}
                endpoints used by the FX engine.
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
                    Pull engine data into CSV/Excel for offline analysis and
                    sharing.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    // TODO: implement real exports
                    alert(
                      "Export endpoints not wired yet. Once ready, this will download CSV for recent rates."
                    );
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export recent rates (CSV)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "Export endpoints not wired yet. Once ready, this will download Excel for recent rates."
                    );
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export recent rates (Excel)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    alert(
                      "Export endpoints not wired yet. Once ready, this will download overrides dataset."
                    );
                  }}
                  className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-zinc-100 hover:bg-zinc-900"
                >
                  Export overrides
                </button>
              </div>

              <p className="text-[0.7rem] text-zinc-500">
                Suggested endpoints (to be implemented):{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  /api/admin/export/rates
                </code>{" "}
                and{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  /api/admin/export/overrides
                </code>
                .
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
                TODO: Re-use the existing FX chart infrastructure to create
                confidential views (e.g. 7-day volatility, override impact,
                liquidity signals).
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
                TODO: Back this card with a small admin table exposed via{" "}
                <code className="rounded bg-zinc-900 px-1 py-0.5">
                  /api/admin/fixing-schedule
                </code>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
