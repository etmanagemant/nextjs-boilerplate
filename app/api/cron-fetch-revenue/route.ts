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
    // Lese die Umsatzzahlen direkt aus dem abgesendeten Befehl aus (Kein Fetch an Supercreator nötig!)
    const jsonDaten = await request.json();
    
    const roheListe = Array.isArray(jsonDaten) ? jsonDaten : (jsonDaten.daten || []);

    const chatterUmsaetze = roheListe.map((user: any) => ({
      scName: String(user.name || user.chatter_name || "").trim(),
      heuteUmsatz: parseFloat(user.umsatz || user.revenue || "0")
    }));
    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T"); // Format: YYYY-MM-DD

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0 || !data.scName) continue;

      // Suche den Mitarbeiter in der DB über seinen exakten Namen
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("full_name", data.scName)
        .maybeSingle();

      if (profile) {
        // Bereits gebuchte Umsätze abfragen
        const { data: bRevenues } = await supabase
          .from("chatter_revenues")
          .select("amount")
          .eq("user_id", profile.user_id)
          .gte("created_at", `${heuteISO}T00:00:00`)
          .lte("created_at", `${heuteISO}T23:59:59`);

        const bereitsVerbucht = (bRevenues || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const differenz = data.heuteUmsatz - bereitsVerbucht;

        if (differenz > 0.01) {
          // Buche die Differenz vollautomatisch auf das Konto des Chatters
          await supabase.from("chatter_revenues").insert([
            {
              user_id: profile.user_id,
              amount: differenz,
              created_at: new Date().toISOString()
            }
          ]);
        }
      }
    }

    return NextResponse.json({ success: true, verbucht: chatterUmsaetze.length });

  } catch (error: any) {
    console.error("Umsatz-Direktbuchung Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
