"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function CentralBankLoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "signing-in" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("signing-in");
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data?.user) {
        console.error("Supabase password sign-in error:", error);
        setStatus("error");
        setErrorMessage(
          error?.message ?? "Invalid email or password. Please try again."
        );
        return;
      }

      // Success → go to central bank dashboard
      router.replace("/central-bank");
    } catch (err: any) {
      console.error("Password sign-in error:", err);
      setStatus("error");
      setErrorMessage("Unexpected error during sign-in.");
    }
  }

  async function handleClearSession() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error clearing session:", err);
    } finally {
      setStatus("idle");
      setErrorMessage(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-zinc-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 space-y-6">
        <div className="space-y-2">
          <p className="text-[0.7rem] uppercase tracking-[0.25em] text-zinc-500">
            EAMU FX · Central Bank Mode
          </p>
          <h1 className="text-xl font-semibold tracking-tight">
            Sign in to A-Mode
          </h1>
          <p className="text-xs text-zinc-400">
            This area is reserved for authorised central bank and admin users.
            Use your assigned email and password to access the dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label
              htmlFor="email"
              className="text-xs font-medium text-zinc-300"
            >
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@centralbank.gov.ss"
              className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-xs font-medium text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <button
            type="submit"
            disabled={status === "signing-in"}
            className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "signing-in" ? "Signing in…" : "Sign in"}
          </button>

          {status === "error" && errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}

          <p className="text-[0.7rem] text-zinc-500">
            Accounts are provisioned centrally. If you need access, please
            contact the system administrator.
          </p>
        </form>

        <div className="flex items-center justify-between text-[0.7rem] text-zinc-500">
          <Link
            href="/"
            className="text-zinc-300 hover:text-white transition underline-offset-4 hover:underline"
          >
            ← Back to public dashboard
          </Link>
          <button
            type="button"
            onClick={handleClearSession}
            className="text-zinc-400 hover:text-zinc-100 transition"
          >
            Clear session
          </button>
        </div>
      </div>
    </main>
  );
}
