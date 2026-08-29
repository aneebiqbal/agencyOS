import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

function requirePublicEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`${name} is required for client authentication.`);
  }
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  browserClient = createClient(
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requirePublicEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return browserClient;
}
