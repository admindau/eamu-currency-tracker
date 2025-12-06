// app/dashboard/SSPUsdChart.tsx
"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type Point = {
  date: string; // YYYY-MM-DD
  rate: number;
};

type Props = {
  data: Point[];
};

export function SSPUsdChart({ data }: Props) {
  const hasData = data && data.length > 0;

  return (
    <div className="w-full rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">
            SSP per 1 USD – Over Time
          </h2>
          <p className="text-[11px] text-zinc-500">
            Based on manual entries from the Savvy Rilla FX Admin.
          </p>
        </div>
      </div>

      {!hasData ? (
        <p className="text-xs text-zinc-500">
          No SSP→USD data yet. Add a rate in{" "}
          <span className="font-mono">/admin</span> to see it here.
        </p>
      ) : (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#a1a1aa" }}
                tickLine={false}
                axisLine={{ stroke: "#27272a" }}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#020617",
                  borderColor: "#3f3f46",
                  borderRadius: 8,
                  fontSize: 11,
                }}
                labelStyle={{ color: "#e4e4e7" }}
                formatter={(value: any) => [
                  Number(value).toLocaleString(),
                  "SSP per 1 USD",
                ]}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#e4e4e7"
                strokeWidth={1.8}
                dot={{ r: 2 }}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
