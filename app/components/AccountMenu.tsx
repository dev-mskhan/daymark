"use client";

import Link from "next/link";
import { SignOut, UserCircle } from "@phosphor-icons/react";
import type { AccountState } from "@/lib/auth/use-account";

/** Sign-in link when signed out; trips link and sign-out when signed in. Hidden if accounts are not configured. */
export function AccountMenu({ account }: { account: AccountState }) {
  if (!account.configured || !account.ready) return null;
  if (!account.user)
    return (
      <Link className="pill-button" href="/sign-in">
        <UserCircle size={18} /> Sign in
      </Link>
    );
  return (
    <>
      <Link className="pill-button" href="/trips">
        My trips
      </Link>
      <form action="/auth/signout" method="post">
        <button
          className="icon-button"
          type="submit"
          aria-label={`Sign out${account.user.email ? ` (${account.user.email})` : ""}`}
          title="Sign out"
        >
          <SignOut size={20} />
        </button>
      </form>
    </>
  );
}
