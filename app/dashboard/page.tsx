// app/dashboard/page.tsx
import { supabaseServer } from "@/lib/supabase/server";
import { SSPUsdChart } from "./SSPUsdChart";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch ALL SSP→USD points we have so far
  const { data, error } = await supabaseServer
    .from("fx_daily_rates_default")
    .select("as_of_date, rate_mid")
    .eq("base_currency", "SSP")
    .eq("quote_currency", "USD")
    .order("as_of_date", { ascending: true });

  const points =
    data?.map((row) => ({
      date: row.as_of_date as string,
      rate: Number(row.rate_mid),
    })) ?? [];

  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Savvy Rilla FX Dashboard
          </h1>
          <p className="text-sm text-zinc-400">
            Early view of SSP performance against the US Dollar over time. Data
            comes from your internal Savvy Rilla FX feed.
          </p>
        </header>

        <section>
          <SSPUsdChart data={points} />
        </section>

        <section className="text-xs text-zinc-500">
          <p>
            Tip: keep using <span className="font-mono">/admin</span> to add
            SSP→USD rates for each day. This chart will grow into a full
            historical picture. Later we&apos;ll add more currencies (KES, EUR,
            GBP) and comparison views.
          </p>
        </section>
      </div>
    </main>
  );
}
