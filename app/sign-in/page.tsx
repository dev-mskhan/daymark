import Link from "next/link";
import { AuthForm } from "@/app/components/AuthForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reason?: string }>;
}) {
  const { next, error, reason } = await searchParams;
  return (
    <main className="auth-page">
      <Link className="back" href="/">
        ← Daymark
      </Link>
      {isSupabaseConfigured() ? (
        <AuthForm next={next} notice={error ?? reason} />
      ) : (
        <p className="notice">Accounts are not configured on this server.</p>
      )}
    </main>
  );
}
