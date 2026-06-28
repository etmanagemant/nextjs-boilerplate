"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ========================================
// MODELS
// ========================================
export async function getModels() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("models")
    .select("id, name")
    .order("name", { ascending: true });
  
  if (error) {
    console.error("Error fetching models:", error);
    return [];
  }
  return data || [];
}

// ========================================
// COMMUNITIES
// ========================================
export async function getContentCommunities() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_communities")
    .select("id, name")
    .order("name", { ascending: true });
  
  if (error) {
    console.error("Error fetching communities:", error);
    return [];
  }
  return data || [];
}

export async function addContentCommunity(formData: FormData) {
  const name = formData.get("name") as string;
  if (!name) return;
  
  const supabase = await createClient();
  await supabase.from("content_communities").insert([{ name }]);
  revalidatePath("/content-plan");
}

export async function deleteContentCommunity(id: string) {
  const supabase = await createClient();
  await supabase.from("content_communities").delete().eq("id", id);
  revalidatePath("/content-plan");
}

// ========================================
// CONTENT PLAN POSTS
// ========================================
export async function getContentPlanPosts(modelId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("content_plan_posts")
    .select("*")
    .eq("model_id", modelId)
    .order("sort_order", { ascending: true });
  
  if (error) {
    console.error("Error fetching content plan posts:", error);
    return [];
  }
  return data || [];
}

export async function updateContentPlanPost(
  postId: string,
  updates: {
    post_date?: string;
    content_type?: string;
    title_idea?: string;
    published?: boolean;
    communities?: string[];
  }
) {
  const supabase = await createClient();
  
  const updatePayload: any = {};
  if (updates.post_date !== undefined) updatePayload.post_date = updates.post_date;
  if (updates.content_type !== undefined) updatePayload.content_type = updates.content_type;
  if (updates.title_idea !== undefined) updatePayload.title_idea = updates.title_idea;
  if (updates.published !== undefined) updatePayload.published = updates.published;
  if (updates.communities !== undefined) updatePayload.communities = updates.communities;
  
  await supabase
    .from("content_plan_posts")
    .update(updatePayload)
    .eq("id", postId);
  
  revalidatePath("/content-plan");
}

export async function updateContentPlanSort(updates: { id: string; sort_order: number }[]) {
  const supabase = await createClient();
  
  for (const update of updates) {
    await supabase
      .from("content_plan_posts")
      .update({ sort_order: update.sort_order })
      .eq("id", update.id);
  }
  
  revalidatePath("/content-plan");
}

export async function deleteContentPlanPost(postId: string) {
  const supabase = await createClient();
  await supabase.from("content_plan_posts").delete().eq("id", postId);
  revalidatePath("/content-plan");
}

export async function createContentPlanPost(formData: FormData) {
  const modelId = formData.get("model_id") as string;
  const photoPath = formData.get("photo_path") as string;
  
  if (!modelId || !photoPath) return;
  
  const supabase = await createClient();
  
  const { data: posts } = await supabase
    .from("content_plan_posts")
    .select("sort_order")
    .eq("model_id", modelId)
    .order("sort_order", { ascending: false })
    .limit(1);
  
  const nextSortOrder = (posts && posts.length > 0) ? (posts[0].sort_order || 0) + 1 : 1;
  
  await supabase.from("content_plan_posts").insert([{
    model_id: modelId,
    photo_path: photoPath,
    sort_order: nextSortOrder,
  }]);
  
  revalidatePath("/content-plan");
}
