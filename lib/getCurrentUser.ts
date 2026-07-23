import { cache } from "react";
import { createClient } from "@/utils/supabase/server";

/**
 * Almost every server page independently called createClient() + auth.getUser(),
 * on top of the root layout already doing the same thing - meaning every single
 * navigation paid for 2+ redundant round-trips to Supabase's auth server before
 * anything could render. React's cache() dedupes calls with the same arguments
 * within a single request, so wrapping these means the work happens once per
 * request no matter how many layouts/pages/components ask for it.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export const getCurrentProfile = cache(async (userId: string) => {
  const { supabase } = await getCurrentUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return profile;
});
