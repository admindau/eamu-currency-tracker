"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export default function CentralBankLoginPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage(null);

    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${origin}/central-bank`,
        },
      });

      if (error) {
        console.error("Supabase magic link error:", error);
        setStatus("error");
        setErrorMessage(error.message ?? "Failed to send magic link.");
        return;
      }

      setStatus("sent");
    } catch (err: any) {
      console.error("Magic link error:", err);
      setStatus("error");
      setErrorMessage("Unexpected error sending magic link.");
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
            Enter your work email to receive a one-time login link.
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

          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {status === "sending"
              ? "Sending magic link..."
              : status === "sent"
              ? "Link sent — check your email"
              : "Send magic link"}
          </button>

          {status === "error" && errorMessage && (
            <p className="text-xs text-red-400">{errorMessage}</p>
          )}

          <p className="text-[0.7rem] text-zinc-500">
            You&apos;ll receive an email with a one-time link. Clicking it will
            bring you back to the Central Bank dashboard.
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
            onClick={async () => {
              await supabase.auth.signOut();
              router.refresh();
            }}
            className="text-zinc-400 hover:text-zinc-100 transition"
          >
            Clear session
          </button>
        </div>
      </div>
    </main>
  );
}
