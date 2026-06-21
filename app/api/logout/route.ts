// app/api/logout/route.ts
import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  const response = NextResponse.redirect(url, { status: 303 });
  
  // Löscht die Sitzungs-Cookies
  response.cookies.delete("sb-access-token");
  response.cookies.delete("sb-refresh-token");

  return response;
}
