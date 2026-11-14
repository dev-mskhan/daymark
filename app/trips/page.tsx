import Link from "next/link";
import { TripsManager } from "@/app/components/TripsManager";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default function TripsPage() {
  return (
    <main className="trips-page">
      <Link className="back" href="/">
        ← Daymark
      </Link>
      <h1>My trips</h1>
      {isSupabaseConfigured() ? (
        <TripsManager />
      ) : (
        <p className="notice">Accounts are not configured on this server.</p>
      )}
    </main>
  );
}
