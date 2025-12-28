"use client";

import Link from "next/link";
import { Suspense, FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

function safeNextPath(input: string | null, fallback: string) {
  if (!input) return fallback;
  // Only allow in-app relative paths to avoid open redirects
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//")) return fallback;
  return input;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getSupabaseBrowserClient();

  const nextPath = useMemo(() => {
    const raw = searchParams.get("next");
    return safeNextPath(raw, "/central-bank");
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "signing-in" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClearSession() {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      setErrorMessage(null);
      setStatus("idle");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("signing-in");
    setErrorMessage(null);

    const cleanEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data?.session) {
      setStatus("error");
      setErrorMessage(error?.message ?? "Sign-in failed. Please try again.");
      return;
    }

    setStatus("idle");
    router.replace(nextPath);
  }

  return (
    <main className="min-h-[calc(100vh-64px)] px-4 py-10">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-black/40 p-6">
        <div className="mb-6">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Central Bank Access
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-zinc-400">
            Sign in to access the Central Bank dashboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-xs font-medium text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-zinc-800 bg-black/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-medium text-zinc-300"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-zinc-800 bg-black/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
            />
          </div>

          {status === "error" && (
            <div className="rounded-xl border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
              {errorMessage ?? "Sign-in failed."}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "signing-in"}
            className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "signing-in" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link
            href="/"
            className="text-zinc-400 hover:text-zinc-100 transition"
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

export default function CentralBankLoginPage() {
  // ✅ Fix: Next requires useSearchParams() to be inside Suspense
  return (
    <Suspense
      fallback={
        <main className="min-h-[calc(100vh-64px)] px-4 py-10">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-zinc-800 bg-black/40 p-6">
            <div className="h-4 w-48 rounded bg-zinc-900/60" />
            <div className="mt-3 h-3 w-72 rounded bg-zinc-900/50" />
            <div className="mt-6 space-y-3">
              <div className="h-9 w-full rounded-xl bg-zinc-900/50" />
              <div className="h-9 w-full rounded-xl bg-zinc-900/50" />
              <div className="h-9 w-full rounded-xl bg-zinc-900/50" />
            </div>
          </div>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
