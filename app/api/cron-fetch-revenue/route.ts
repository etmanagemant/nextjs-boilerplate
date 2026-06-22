import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 🛡️ PRODUKTIONS-SCHUTZ: Lässt nur deinen autorisierten Taktgeber rein!
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  let testDatenForLogs = "";
  try {
    // 🚀 UNBLOCKIERBARE API-ABFRAGE: Geht an jedem Bot-Schutz direkt vorbei!
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
    testDatenForLogs = JSON.stringify(jsonDaten);
    
    // 🛡️ BOMBENSICHERER PARSER-FIX: Fängt alle erdenklichen Antwort-Strukturen flexibel ab!
    const roheListe = Array.isArray(jsonDaten) 
      ? jsonDaten 
      : (jsonDaten.data || jsonDaten.creator_earnings || jsonDaten.chatters || []);

    const chatterUmsaetze = roheListe.map((user: any) => ({
      scName: String(user.chatter_name || user.name || user.username || "").trim(),
      heuteUmsatz: parseFloat(user.today_revenue || user.revenue || user.amount || "0")
    }));
    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T"); // Format: YYYY-MM-DD

    for (const data of chatterUmsaetze) {
      if (data.heuteUmsatz <= 0 || !data.scName) continue;

      // Suchen nach dem Mitarbeiter-Profil (sucht flexibel nach full_name oder email)
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .or(`full_name.ilike.${data.scName},email.ilike.${data.scName}`)
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
          // Trägt die Differenz live in eure Datenbank ein
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

    return NextResponse.json({ success: true, verarbeitet: chatterUmsaetze.length, daten: chatterUmsaetze });

  } catch (error: any) {
    console.error("Supercreator-API-Abgleich Fehler:", error);
    return NextResponse.json({ 
      success: false, 
      error: error.message, 
      rawReceived: testDatenForLogs.slice(0, 200) // Gibt uns im Fehlerfall die ersten 200 Zeichen der echten API aus!
    }, { status: 500 });
  }
}
