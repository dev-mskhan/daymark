"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export interface AccountState {
  configured: boolean;
  ready: boolean;
  user: { id: string; email: string | null } | null;
}

/** Tracks the signed-in user in the browser (validated with Supabase Auth, kept fresh on auth events). */
export function useAccount(): AccountState {
  const configured = isSupabaseConfigured();
  const [state, setState] = useState<Omit<AccountState, "configured">>({
    ready: !configured,
    user: null,
  });

  useEffect(() => {
    if (!configured) return;
    const supabase = createSupabaseBrowserClient();
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active)
        setState({
          ready: true,
          user: data.user
            ? { id: data.user.id, email: data.user.email ?? null }
            : null,
        });
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        ready: true,
        user: session?.user
          ? { id: session.user.id, email: session.user.email ?? null }
          : null,
      });
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [configured]);

  return { configured, ...state };
}
