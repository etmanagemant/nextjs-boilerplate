import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const modelId = formData.get("modelId") as string;

    if (!file || !modelId) {
      return NextResponse.json(
        { error: "Datei und Model ID erforderlich" },
        { status: 400 }
      );
    }

    // Validiere Dateitype
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Nur Bilder sind erlaubt" },
        { status: 400 }
      );
    }

    // Validiere Dateigröße (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Datei zu groß (max 10MB)" },
        { status: 400 }
      );
    }

    // Generiere eindeutigen Dateinamen
    const timestamp = Date.now();
    const sanitizedName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
    const fileName = `${timestamp}_${sanitizedName}`;

    const supabase = await createClient();

    // Upload zu Supabase Storage
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("reddit_content")
      .upload(fileName, Buffer.from(buffer), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Fehler beim Upload zu Storage: " + uploadError.message },
        { status: 500 }
      );
    }

    console.log("File uploaded to storage:", uploadData);

    // Erstelle Post in DB mit dem Storage-Pfad

    const { data: posts, error: postsError } = await supabase
      .from("content_plan_posts")
      .select("sort_order")
      .eq("model_id", modelId)
      .order("sort_order", { ascending: false })
      .limit(1);

    if (postsError) {
      console.error("Supabase query error:", postsError);
    }

    const nextSortOrder =
      posts && posts.length > 0 ? (posts[0].sort_order || 0) + 1 : 1;

    const { data: newPost, error: insertError } = await supabase
      .from("content_plan_posts")
      .insert([
        {
          model_id: modelId,
          photo_path: fileName,
          sort_order: nextSortOrder,
        },
      ])
      .select("*")
      .single();

    if (insertError) {
      console.error("DB Insert Error:", insertError);
      console.error("Error details:", JSON.stringify(insertError, null, 2));
      return NextResponse.json(
        { error: "Fehler beim Erstellen des Posts: " + insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      fileName,
      post: newPost,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload fehlgeschlagen" },
      { status: 500 }
    );
  }
}
