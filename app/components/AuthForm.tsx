"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { safeNextPath } from "@/lib/auth/redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MESSAGES: Record<string, string> = {
  callback: "We couldn't complete that sign-in. Please try again.",
  expired: "Your session expired. Please sign in again.",
};

export function AuthForm({
  mode,
  next,
  notice,
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
  notice?: string;
}) {
  const signUp = mode === "sign-up";
  const destination = safeNextPath(next, "/trips");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice ? (MESSAGES[notice] ?? "") : "");
  const [info, setInfo] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const supabase = createSupabaseBrowserClient();
      if (signUp) {
        const { data, error: failure } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
          },
        });
        if (failure) throw failure;
        if (!data.session) {
          setInfo("Check your email to confirm your address, then sign in.");
          return;
        }
      } else {
        const { error: failure } =
          await supabase.auth.signInWithPassword({ email, password });
        if (failure) throw failure;
      }
      location.assign(destination);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: failure } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
        },
      });
      if (failure) throw failure;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Google sign-in failed.",
      );
    }
  }

  return (
    <form className="trip-form auth-form" onSubmit={submit}>
      <h1>{signUp ? "Create your account" : "Welcome back"}</h1>
      {error && (
        <div className="notice-box notice-warning" role="alert">
          <span className="notice-icon">
            <WarningCircle size={18} />
          </span>
          <div>
            <p>{error}</p>
          </div>
        </div>
      )}
      {info && (
        <div className="notice-box" role="status">
          <div>
            <p>{info}</p>
          </div>
        </div>
      )}
      <label className="field">
        <span>Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field">
        <span>Password</span>
        <input
          type="password"
          autoComplete={signUp ? "new-password" : "current-password"}
          required
          minLength={signUp ? 8 : 1}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <button className="primary" disabled={busy}>
        <span>
          {busy ? "Please wait…" : signUp ? "Create account" : "Sign in"}
        </span>
      </button>
      <button type="button" className="pill-button" onClick={google}>
        Continue with Google
      </button>
      <p className="notice">
        {signUp ? "Already have an account? " : "New to Daymark? "}
        <Link
          href={`${signUp ? "/sign-in" : "/sign-up"}${next ? `?next=${encodeURIComponent(destination)}` : ""}`}
        >
          {signUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
