import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
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

    // Speichere Datei
    const buffer = await file.arrayBuffer();
    const imagePath = join(process.cwd(), "public", "images", fileName);
    
    // Stelle sicher dass Verzeichnis existiert
    try {
      await mkdir(join(process.cwd(), "public", "images"), { recursive: true });
    } catch (err) {
      // Verzeichnis existiert wahrscheinlich schon
    }

    await writeFile(imagePath, Buffer.from(buffer));

    // Erstelle Post in DB
    const supabase = await createClient();

    const { data: posts } = await supabase
      .from("content_plan_posts")
      .select("sort_order")
      .eq("model_id", modelId)
      .order("sort_order", { ascending: false })
      .limit(1);

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
      console.error("DB Error:", insertError);
      return NextResponse.json(
        { error: "Fehler beim Erstellen des Posts" },
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
