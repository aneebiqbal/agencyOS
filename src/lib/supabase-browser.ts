import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/**
 * Next.js only inlines NEXT_PUBLIC_* when accessed as static property reads
 * (`process.env.NEXT_PUBLIC_FOO`). Dynamic access (`process.env[name]`) is
 * undefined in the browser bundle.
 */
function getPublicSupabaseConfig(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || url.trim().length === 0) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for client authentication.");
  }
  if (!anonKey || anonKey.trim().length === 0) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is required for client authentication.");
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const { url, anonKey } = getPublicSupabaseConfig();

  browserClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
