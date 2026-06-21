import { cookies } from "next/headers";

// Try to load createServerComponentClient from @supabase/auth-helpers-nextjs if available.
// If the package isn't installed in the environment (e.g. during certain build steps),
// fall back to creating a minimal supabase client using @supabase/supabase-js.
// Keep types loose here to avoid type errors when the helper package is missing.
// Declare as a generic function so callers can provide a type argument.
let createServerComponentClient: <T = any>(opts: any) => any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  createServerComponentClient = require("@supabase/auth-helpers-nextjs").createServerComponentClient;
} catch (e) {
  // Fallback: use createClient from supabase-js
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createClient } = require("@supabase/supabase-js");
  createServerComponentClient = (opts: any) => {
    const url = opts.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = opts.supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return createClient(url, key);
  };
}

// Fallback Database type to avoid missing import error during build.
// Replace with a proper import if ./database.types is available.
type Database = any;

export function getSupabaseServer() {
  const cookieStore = cookies();

  return createServerComponentClient<Database>({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    cookies: cookieStore,
  });
}