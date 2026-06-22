import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // 🛡️ PRODUKTIONS-SCHUTZ: Lässt nur dich mit dem richtigen Passwort rein!
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  try {
    // 🚀 UNZERSTÖRBAR: Lese die Umsatzzahlen direkt aus dem abgesendeten Paket! (Kein fehlerhafter Server-Abruf nötig)
    const jsonDaten = await request.json();
    
    // Fängt alle gängigen Datenformate (rohes Array oder verschachtelt) sicher ab
    const roheListe = Array.isArray(jsonDaten) 
      ? jsonDaten 
      : (jsonDaten.data || jsonDaten.stats || jsonDaten.chatters || []);

    const chatterUmsaetze = roheListe.map((user: any) => ({
      scName: String(user.chatter_name || user.name || user.username || "").trim(),
      heuteUmsatz: parseFloat(user.today_revenue || user.revenue || user.umsatz || "0"),
      modelId: user.model_id || null
    }));

    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T"); // Format: YYYY-MM-DD

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0) continue;

      // Wenn der Umsatz unassigned ist oder kein Name passt -> Admin-ID als Auffangbecken (Für freie Tips!)
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

      // Bereits gebuchte Umsätze abfragen, um Doppeleinträge zu verhindern
      const { data: bRevenues } = await supabase
        .from("chatter_revenues")
        .select("amount")
        .eq("user_id", zielUserId)
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
    console.error("Umsatz-Direktbuchung Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
