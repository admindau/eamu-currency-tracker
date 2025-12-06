// app/admin/ManualRateForm.tsx
"use client";

import { FormEvent, useState } from "react";

type Props = {
  availableQuotes: string[];
};

export function ManualRateForm({ availableQuotes }: Props) {
  const [asOfDate, setAsOfDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [quoteCurrency, setQuoteCurrency] = useState("USD");
  const [rateMid, setRateMid] = useState("");
  const [isOfficial, setIsOfficial] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/admin/manual-rate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asOfDate,
          quoteCurrency,
          rateMid: Number(rateMid),
          isOfficial,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save FX rate");
      } else {
        setStatus("FX rate saved successfully.");
        setRateMid("");
      }
    } catch (err: any) {
      setError(err?.message ?? "Unexpected error");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl rounded-2xl border border-zinc-800 bg-zinc-950/60 p-6">
      <h2 className="mb-4 text-lg font-semibold">
        Add SSP FX Rate (Manual Entry)
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        <div className="flex flex-col gap-1 text-left">
          <label className="text-xs text-zinc-400">Date</label>
          <input
            type="date"
            className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 text-left">
          <label className="text-xs text-zinc-400">
            Quote Currency (1 unit of this currency)
          </label>
          <select
            className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={quoteCurrency}
            onChange={(e) => setQuoteCurrency(e.target.value)}
          >
            {availableQuotes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-zinc-500">
            Base currency is fixed as <span className="font-mono">SSP</span>.
            This records how many SSP you need for{" "}
            <span className="font-mono">1 {quoteCurrency}</span>.
          </p>
        </div>

        <div className="flex flex-col gap-1 text-left">
          <label className="text-xs text-zinc-400">
            Rate (SSP per 1 {quoteCurrency})
          </label>
          <input
            type="number"
            step="0.000001"
            min="0"
            className="rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm outline-none focus:border-zinc-400"
            value={rateMid}
            onChange={(e) => setRateMid(e.target.value)}
            placeholder="e.g. 4500"
            required
          />
        </div>

        <div className="flex items-center gap-2 text-left">
          <input
            id="isOfficial"
            type="checkbox"
            checked={isOfficial}
            onChange={(e) => setIsOfficial(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-700 bg-black"
          />
          <label htmlFor="isOfficial" className="text-xs text-zinc-400">
            Mark as official rate
          </label>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !rateMid}
          className="mt-2 inline-flex items-center justify-center rounded-md border border-zinc-600 bg-zinc-100 px-4 py-2 text-xs font-medium text-black hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Saving..." : "Save FX Rate"}
        </button>

        {status && (
          <p className="mt-2 text-xs text-emerald-400">{status}</p>
        )}
        {error && (
          <p className="mt-2 text-xs text-red-400">Error: {error}</p>
        )}
      </form>
    </div>
  );
}
