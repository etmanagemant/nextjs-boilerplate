// app/api/logout/route.ts
import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic"; // Required for auth signout

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // NEXT_PUBLIC_SITE_URL was never actually set anywhere (only
  // NEXT_PUBLIC_APP_URL is) - every logout in production was silently
  // falling back to http://localhost:3000, which fails for everyone except
  // possibly the original dev's own machine. Building the redirect from the
  // incoming request's own origin instead works correctly on production,
  // every preview deployment, and locally, with no env var dependency.
  const url = new URL("/login", request.url);
  const response = NextResponse.redirect(url, { status: 303 });
  
  // Löscht die Sitzungs-Cookies
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");

  return response;
}
