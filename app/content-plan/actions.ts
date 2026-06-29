"use server";

import { createClient } from "@/utils/supabase/server";
import { revalidatePath } from "next/cache";

// ========================================
// MODELS
// ========================================
export async function getModels() {
  try {
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
  } catch (err) {
    console.error("Exception fetching models:", err);
    return [];
  }
}

// ========================================
// COMMUNITIES
// ========================================
export async function getContentCommunities() {
  try {
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
  } catch (err) {
    console.error("Exception fetching communities:", err);
    return [];
  }
}

export async function addContentCommunity(formData: FormData) {
  try {
    const name = formData.get("name") as string;
    if (!name) return;
    
    const supabase = await createClient();
    await supabase.from("content_communities").insert([{ name }]);
    revalidatePath("/content-plan");
  } catch (err) {
    console.error("Exception adding community:", err);
  }
}

export async function deleteContentCommunity(id: string) {
  try {
    const supabase = await createClient();
    await supabase.from("content_communities").delete().eq("id", id);
    revalidatePath("/content-plan");
  } catch (err) {
    console.error("Exception deleting community:", err);
  }
}

// ========================================
// CONTENT PLAN POSTS
// ========================================
export async function getContentPlanPosts(modelId: string) {
  try {
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
  } catch (err) {
    console.error("Exception fetching content plan posts:", err);
    return [];
  }
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
  try {
    const supabase = await createClient();
    
    if (!postId) {
      throw new Error("Keine Post-ID vorhanden");
    }
    
    const updatePayload: any = {};
    if (updates.post_date !== undefined) updatePayload.post_date = updates.post_date || null;
    if (updates.content_type !== undefined) updatePayload.content_type = updates.content_type || null;
    if (updates.title_idea !== undefined) updatePayload.title_idea = updates.title_idea || null;
    if (updates.published !== undefined) updatePayload.published = updates.published;
    if (updates.communities !== undefined) updatePayload.communities = updates.communities || [];
    
    console.log("[UPDATE] Post ID:", postId);
    console.log("[UPDATE] Payload:", updatePayload);
    
    const { error, data } = await supabase
      .from("content_plan_posts")
      .update(updatePayload)
      .eq("id", postId)
      .select();
    
    if (error) {
      console.error("[ERROR] Supabase update failed:", error);
      throw new Error(`DB Error: ${error.message}`);
    }
    
    console.log("[SUCCESS] Post updated:", data);
    revalidatePath("/content-plan");
    return { success: true, data };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[EXCEPTION] Update failed:", errorMsg);
    throw err;
  }
}

export async function updateContentPlanSort(updates: { id: string; sort_order: number }[]) {
  try {
    const supabase = await createClient();
    
    for (const update of updates) {
      await supabase
        .from("content_plan_posts")
        .update({ sort_order: update.sort_order })
        .eq("id", update.id);
    }
    
    revalidatePath("/content-plan");
  } catch (err) {
    console.error("Exception updating content plan sort:", err);
  }
}

export async function deleteContentPlanPost(postId: string) {
  try {
    const supabase = await createClient();
    
    // Zuerst das Post abrufen um den photo_path zu bekommen
    const { data: post } = await supabase
      .from("content_plan_posts")
      .select("photo_path")
      .eq("id", postId)
      .single();
    
    // Lösche die Datei aus Supabase Storage wenn sie existiert
    if (post?.photo_path) {
      const { error: storageError } = await supabase.storage
        .from("reddit_content")
        .remove([post.photo_path]);
      
      if (storageError) {
        console.error("Error deleting file from storage:", storageError);
      } else {
        console.log("File deleted from storage:", post.photo_path);
      }
    }
    
    // Lösche den DB-Eintrag
    await supabase.from("content_plan_posts").delete().eq("id", postId);
    revalidatePath("/content-plan");
  } catch (err) {
    console.error("Exception deleting content plan post:", err);
  }
}

export async function createContentPlanPost(formData: FormData) {
  try {
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
  } catch (err) {
    console.error("Exception creating content plan post:", err);
  }
}

export async function uploadAndCreatePost(formData: FormData) {
  try {
    const modelId = formData.get("model_id") as string;
    const file = formData.get("file") as File;
    
    if (!modelId || !file) {
      return { error: "Model ID und Datei erforderlich" };
    }

    // Generiere eindeutigen Dateinamen
    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fileName = `${timestamp}_${sanitizedName}`;

    // Speichere die Datei in public/images/
    const fs = await import("fs").then(m => m.promises);
    const path = await import("path");
    const imagePath = path.join(process.cwd(), "public", "images", fileName);
    
    const buffer = await file.arrayBuffer();
    await fs.writeFile(imagePath, Buffer.from(buffer));

    // Erstelle den Post in der DB
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
      photo_path: fileName,
      sort_order: nextSortOrder,
    }]);
    
    revalidatePath("/content-plan");
    return { success: true, fileName };
  } catch (err) {
    console.error("Exception uploading and creating post:", err);
    return { error: "Upload fehlgeschlagen" };
  }
}
