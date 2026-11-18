"use client";

import { FormEvent, useState } from "react";
import { WarningCircle } from "@phosphor-icons/react";
import { safeNextPath } from "@/lib/auth/redirect";
import { requestEmailSignIn } from "@/lib/auth/email-link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MESSAGES: Record<string, string> = {
  callback: "We couldn't complete that sign-in. Please try again.",
  expired: "Your session expired. Please sign in again.",
};

export function AuthForm({
  next,
  notice,
}: {
  next?: string;
  notice?: string;
}) {
  const destination = safeNextPath(next, "/trips");
  const [email, setEmail] = useState("");
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
      await requestEmailSignIn(
        supabase.auth,
        email,
        `${location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
      );
      setInfo("If this address can sign in or register, check your email for a secure link.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError("");
    setInfo("");
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
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="trip-form auth-form" onSubmit={submit}>
      <h1>Sign in or create your account</h1>
      <p className="notice">Use your email to receive a secure sign-in link. New accounts are created automatically.</p>
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
      <button className="primary" disabled={busy}>
        <span>
          {busy ? "Please wait…" : "Email me a sign-in link"}
        </span>
      </button>
      <button type="button" className="pill-button" onClick={google} disabled={busy}>
        Continue with Google
      </button>
    </form>
  );
}
