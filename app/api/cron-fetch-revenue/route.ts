import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  try {
    const response = await fetch("https://supercreator.app", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.SUPERCREATOR_API_TOKEN}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Supercreator API verweigert Zugriff: Status ${response.status}`);
    }

    const jsonDaten = await response.json();
    const roheListe = Array.isArray(jsonDaten) ? jsonDaten : (jsonDaten.data || jsonDaten.creator_earnings || []);

    const chatterUmsaetze = roheListe.map((user: any) => ({
      scName: String(user.chatter_name || user.name || "").trim(),
      heuteUmsatz: parseFloat(user.today_revenue || user.revenue || "0"),
      modelId: user.model_id || null
    }));

    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T");

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0) continue;

      // 🛡️ ADMIN-FALLBACK-FIX: Wenn der Name unzugeordnet ist, parken wir das Geld auf deiner Admin-ID!
      let zielUserId = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'; 

      if (data.scName && data.scName.toLowerCase() !== "unassigned" && data.scName.toLowerCase() !== "system") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("full_name", data.scName)
          .maybeSingle();

        if (profile) {
          zielUserId = profile.user_id;
        }
      }

      // Bereits gebuchte Umsätze für diese Kombination abfragen
      const { data: bRevenues } = await supabase
        .from("chatter_revenues")
        .select("amount")
        .eq("user_id", zielUserId)
        .eq("model_id", data.modelId)
        .gte("created_at", `${heuteISO}T00:00:00`)
        .lte("created_at", `${heuteISO}T23:59:59`);

      const bereitsVerbucht = (bRevenues || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const differenz = data.heuteUmsatz - bereitsVerbucht;

      if (differenz > 0.01) {
        await supabase.from("chatter_revenues").insert([
          {
            user_id: zielUserId,
            model_id: data.modelId,
            amount: differenz,
            created_at: new Date().toISOString()
          }
        ]);
      }
    }

    return NextResponse.json({ success: true, verarbeitet: chatterUmsaetze.length });

  } catch (error: any) {
    console.error("Supercreator-API-Abgleich Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
