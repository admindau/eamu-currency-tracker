// app/docs/page.tsx

export default function DocsPage() {
  const baseUrl = "https://fx.savvyrilla.tech/api/v1";

  return (
    <main className="min-h-screen bg-black text-zinc-100 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-10">
        {/* Header */}
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
            Savvy Rilla FX API
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Public API Documentation (v1)
          </h1>
          <p className="text-sm text-zinc-400">
            Read-only FX rates API for SSP and key global currencies. All
            endpoints are versioned under <code className="bg-zinc-900 px-1 py-0.5 rounded text-[0.7rem]">/api/v1</code>.
          </p>
        </header>

        {/* Base URL & Versioning */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Base URL & Versioning</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm space-y-3">
            <div>
              <p className="text-zinc-400 mb-1">Production base URL</p>
              <code className="rounded bg-zinc-900 px-2 py-1 text-xs">
                {baseUrl}
              </code>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase mb-1">
                  Version
                </p>
                <p className="text-sm">v1 (path-based)</p>
                <p className="text-xs text-zinc-500">
                  All endpoints start with <code>/api/v1</code>. Breaking
                  changes will go to <code>/api/v2</code>.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-zinc-500 uppercase mb-1">
                  Response headers
                </p>
                <p className="text-xs text-zinc-400">
                  Every response includes{" "}
                  <code className="bg-zinc-900 px-1 py-0.5 rounded">
                    X-FX-API-Version: v1
                  </code>
                  .
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Auth */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Authentication</h2>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm space-y-2">
            <p>
              <span className="font-medium text-zinc-100">
                Read-only endpoints
              </span>{" "}
              documented on this page are currently{" "}
              <span className="font-medium text-emerald-400">public</span> and
              do not require authentication.
            </p>
            <p className="text-xs text-zinc-500">
              Write/admin endpoints (used by internal dashboards) are protected
              separately and are not part of the public v1 surface yet.
            </p>
          </div>
        </section>

        {/* Quick Endpoint Overview */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Endpoint Overview</h2>
          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950/60">
            <table className="min-w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-400">
                <tr>
                  <th className="px-3 py-2 font-semibold">Method</th>
                  <th className="px-3 py-2 font-semibold">Path</th>
                  <th className="px-3 py-2 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/currencies</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    List supported currencies.
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/rates/latest</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Latest mid rate for all quote currencies vs base (SSP
                    default).
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/rates/&lt;quote&gt;/latest</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Latest snapshot for a single pair (e.g. SSP/USD).
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/rates/history</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Time series history for a given pair.
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/rates/recent</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Recent FX records (latest rows).
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/summary/market</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Compact summary for “Market Snapshot” (rate + change +
                    range).
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2 align-top text-emerald-400">GET</td>
                  <td className="px-3 py-2 align-top">
                    <code>/export/rates</code>
                  </td>
                  <td className="px-3 py-2 align-top">
                    Export historical rates as JSON or CSV.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* /currencies */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /currencies</h2>
          <p className="text-sm text-zinc-400">
            Returns the list of supported currencies (code, name, symbol,
            decimals).
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}/currencies
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>search</code> (optional) — filter by code or name.
                </li>
                <li>
                  <code>active</code> (optional) — reserved for future use
                  (e.g. <code>true</code> / <code>false</code>).
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/currencies"`}
              </pre>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example response</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`{
  "data": [
    { "code": "SSP", "name": "South Sudanese Pound", "symbol": "£", "decimals": 2 },
    { "code": "USD", "name": "US Dollar", "symbol": "$", "decimals": 2 }
  ],
  "meta": {
    "count": 2,
    "activeOnly": true
  }
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* /rates/latest */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /rates/latest</h2>
          <p className="text-sm text-zinc-400">
            Returns the latest mid rate for all quote currencies against a base
            (default <code>SSP</code>). Falls back to{" "}
            <code>fx_daily_rates_default</code> if there are no live rates.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}/rates/latest?base=SSP
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — base currency code, defaults to{" "}
                  <code>SSP</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/rates/latest?base=SSP"`}
              </pre>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example response</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`{
  "base": "SSP",
  "as_of_date": "2025-11-20",
  "source": "fx_daily_rates",
  "rates": {
    "USD": 4571.0054,
    "EUR": 5020.11,
    "KES": 29.12
  }
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* /rates/<quote>/latest */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">
            GET /rates/&lt;quote&gt;/latest
          </h2>
          <p className="text-sm text-zinc-400">
            Returns a snapshot for a single FX pair, e.g.{" "}
            <code>SSP/USD</code>, including latest mid rate and % change vs
            previous fixing.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}/rates/USD/latest?base=SSP
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — base currency, defaults to{" "}
                  <code>SSP</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/rates/USD/latest?base=SSP"`}
              </pre>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example response</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`{
  "pair": "SSP/USD",
  "base": "SSP",
  "quote": "USD",
  "as_of_date": "2025-11-20",
  "mid_rate": 4571.0054,
  "change_pct_vs_previous": 0.2,
  "is_official": true,
  "is_manual_override": false,
  "source_id": 1
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* /rates/history */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /rates/history</h2>
          <p className="text-sm text-zinc-400">
            Returns time series data for a given pair. You can request a rolling
            window using <code>days</code> or pass explicit{" "}
            <code>from</code>/<code>to</code> dates.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}
                /rates/history?base=SSP&amp;quote=USD&amp;days=30
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — defaults to <code>SSP</code>.
                </li>
                <li>
                  <code>quote</code> (optional) — defaults to{" "}
                  <code>USD</code>.
                </li>
                <li>
                  <code>days</code> (optional) — mutually exclusive with{" "}
                  <code>from</code>/<code>to</code>. Positive integer (e.g.{" "}
                  <code>30</code>, <code>90</code>, <code>365</code>).
                </li>
                <li>
                  <code>from</code>, <code>to</code> (optional) — ISO dates
                  <code>YYYY-MM-DD</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/rates/history?base=SSP&quote=USD&days=30"`}
              </pre>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example response</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`{
  "pair": "SSP/USD",
  "base": "SSP",
  "quote": "USD",
  "points": [
    { "date": "2025-10-22", "mid": 4560.22 },
    { "date": "2025-10-23", "mid": 4563.80 }
  ],
  "meta": {
    "from": "2025-10-22",
    "to": "2025-11-20",
    "count": 30
  }
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* /rates/recent */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /rates/recent</h2>
          <p className="text-sm text-zinc-400">
            Returns a list of the most recent FX rows, optionally filtered by
            quote currency.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}
                /rates/recent?base=SSP&amp;quote=USD&amp;limit=10
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — defaults to{" "}
                  <code>SSP</code>.
                </li>
                <li>
                  <code>quote</code> (optional) — filter by quote currency code.
                </li>
                <li>
                  <code>limit</code> (optional) — max rows (1–100, default{" "}
                  <code>20</code>).
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/rates/recent?base=SSP&quote=USD&limit=10"`}
              </pre>
            </div>
          </div>
        </section>

        {/* /summary/market */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /summary/market</h2>
          <p className="text-sm text-zinc-400">
            Returns a compact snapshot for a single pair, suitable for “Market
            Snapshot” UI cards.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}
                /summary/market?base=SSP&amp;quote=USD
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — defaults to{" "}
                  <code>SSP</code>.
                </li>
                <li>
                  <code>quote</code> (optional) — defaults to{" "}
                  <code>USD</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example response</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`{
  "base": "SSP",
  "quote": "USD",
  "as_of_date": "2025-11-20",
  "mid_rate": 4571.0054,
  "change_pct_vs_previous": 0.2,
  "range": {
    "window_days": 7,
    "high": 4583.58,
    "low": 4562.03
  },
  "trend": {
    "window_days": 3,
    "label": "Range-Bound"
  },
  "volatility": {
    "window_days": 30,
    "avg_daily_move_pct": null
  }
}`}
              </pre>
            </div>
          </div>
        </section>

        {/* /export/rates */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">GET /export/rates</h2>
          <p className="text-sm text-zinc-400">
            Exports historical FX data for a time period as JSON or CSV. CSV is
            ideal for spreadsheets and external analysis.
          </p>

          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-3">
            <div>
              <p className="font-medium text-zinc-200 mb-1">Request</p>
              <code className="block rounded bg-zinc-900 px-2 py-1">
                GET {baseUrl}
                /export/rates?base=SSP&amp;quote=USD&amp;from=2025-01-01&amp;to=2025-11-20&amp;format=csv
              </code>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Query params</p>
              <ul className="list-disc pl-5 space-y-1 text-zinc-400">
                <li>
                  <code>base</code> (optional) — defaults to{" "}
                  <code>SSP</code>.
                </li>
                <li>
                  <code>quote</code> (optional) — filter by quote currency.
                </li>
                <li>
                  <code>from</code>, <code>to</code> (required) — ISO dates{" "}
                  <code>YYYY-MM-DD</code>.
                </li>
                <li>
                  <code>format</code> (optional) — <code>csv</code> (default) or{" "}
                  <code>json</code>.
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-zinc-200 mb-1">Example curl</p>
              <pre className="rounded bg-zinc-900 p-3 overflow-x-auto">
{`curl "${baseUrl}/export/rates?base=SSP&quote=USD&from=2025-01-01&to=2025-11-20&format=csv" -o fx_rates_usd_ssp.csv`}
              </pre>
            </div>
          </div>
        </section>

        {/* Errors */}
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Error format</h2>
          <p className="text-sm text-zinc-400">
            Errors are returned with a consistent JSON structure:
          </p>
          <pre className="rounded bg-zinc-900 p-3 text-xs overflow-x-auto">
{`{
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "days must be a positive integer."
  }
}`}
          </pre>
          <p className="text-xs text-zinc-500">
            Common codes include <code>INVALID_PARAMETER</code>,{" "}
            <code>MISSING_PARAMETER</code>, <code>NO_DATA</code>, and{" "}
            <code>DB_ERROR</code>.
          </p>
        </section>

        {/* Footer */}
        <footer className="pt-4 border-t border-zinc-900 text-xs text-zinc-500">
          Savvy Rilla FX API v1 · Powered by Savvy Gorilla Technologies™
        </footer>
      </div>
    </main>
  );
}
