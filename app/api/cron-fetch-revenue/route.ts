import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Erlaubt sowohl den GitHub Taktgeber (Bearer) als auch den direkten Browser-Aufruf zum Testen!
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  try {
    // 🚀 DIE ECHTE DIREKTANBINDUNG: Zieht die Umsätze live über das Token eures Accounts!
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
      scName: String(user.chatter_name || user.name || user.username || "").trim(),
      heuteUmsatz: parseFloat(user.today_revenue || user.revenue || user.amount || "0")
    }));

    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T");

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0 || !data.scName) continue;

      // Findet das Mitarbeiter-Profil fehlerfrei in eurer Tabelle
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .or(`full_name.ilike.${data.scName},email.ilike.${data.scName}`)
        .maybeSingle();

      if (profile) {
        const { data: bRevenues } = await supabase
          .from("chatter_revenues")
          .select("amount")
          .eq("user_id", profile.user_id)
          .gte("created_at", `${heuteISO[0]}T00:00:00`)
          .lte("created_at", `${heuteISO[0]}T23:59:59`);

        const bereitsVerbucht = (bRevenues || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const differenz = data.heuteUmsatz - bereitsVerbucht;

        if (differenz > 0.01) {
          await supabase.from("chatter_revenues").insert([
            { user_id: profile.user_id, amount: differenz, created_at: new Date().toISOString() }
          ]);
        }
      }
    }

    return NextResponse.json({ success: true, verarbeitet: chatterUmsaetze.length });

  } catch (error: any) {
    console.error("Supercreator-API Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
