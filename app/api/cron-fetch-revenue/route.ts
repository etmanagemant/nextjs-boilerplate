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
    const jsonDaten = await request.json();
    const roheListe = Array.isArray(jsonDaten) ? jsonDaten : (jsonDaten.daten || []);

    const chatterUmsaetze = roheListe.map((user: any) => ({
      scName: String(user.name || user.chatter_name || user.full_name || "").trim(),
      heuteUmsatz: parseFloat(user.umsatz || user.revenue || "0"),
      // 🛡️ JAVASCRIPT-JOKER: Ermöglicht das direkte Übergeben der ID beim lokalen Testen
      directUserId: user.user_id || user.chatter_id || null
    }));

    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T")[0]; // Format: YYYY-MM-DD

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0) continue;
      let zielUserId = data.directUserId;

      // Falls keine ID mitgeschickt wurde, suchen wir den Chatter fehlersicher über den Namen
      if (!zielUserId && data.scName) {
        // 🛡️ SPALTEN-FIX: Durchsucht flexibel alle Namensvarianten der Profile-Tabelle!
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .or(`name.ilike.${data.scName},full_name.ilike.${data.scName}`)
          .maybeSingle();

        if (profile) {
          zielUserId = profile.user_id;
        }
      }

      // Wenn wir den Mitarbeiter gefunden haben, buchen wir den Umsatz!
      if (zielUserId) {
        // Bereits gebuchte Umsätze abfragen
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
