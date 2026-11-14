import Link from "next/link";
import { AuthForm } from "@/app/components/AuthForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="auth-page">
      <Link className="back" href="/">
        ← Daymark
      </Link>
      {isSupabaseConfigured() ? (
        <AuthForm mode="sign-up" next={next} />
      ) : (
        <p className="notice">Accounts are not configured on this server.</p>
      )}
    </main>
  );
}
