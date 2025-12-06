// app/admin/login/page.tsx
"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok || json?.error) {
        setStatus("error");
        setError(json?.error || json?.message || "Login failed");
        return;
      }

      // Redirect to admin dashboard
      window.location.href = "/admin";
    } catch (err: any) {
      setStatus("error");
      setError(err?.message || "Unexpected error during login");
    }
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm border border-white/10 rounded-2xl p-6 bg-white/5 shadow-xl">
        <h1 className="text-xl font-semibold text-center mb-4">
          Savvy Rilla FX – Admin Login
        </h1>
        <p className="text-xs text-white/60 mb-4 text-center">
          Enter the admin password to access FX controls.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">Admin password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg bg-black border border-white/20 px-3 py-2 text-sm outline-none focus:border-white focus:ring-1 focus:ring-white"
              required
            />
          </div>

          {error && (
            <div className="text-xs rounded-lg px-3 py-2 bg-red-500/10 border border-red-500/40 text-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-xl border border-white/40 bg-white text-black py-2.5 text-sm font-semibold tracking-wide disabled:opacity-60 disabled:cursor-not-allowed hover:bg-black hover:text-white hover:border-white transition-colors"
          >
            {status === "submitting" ? "Checking…" : "Login"}
          </button>
        </form>
      </div>
    </main>
  );
}
