import { NextResponse } from "next/server";
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

// 🤖 1. DIE AUTOMATISCHE SERVER-ABFRAGE (FÜR GITHUB-CRONJOB)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  try {
    // Holt die Daten über die active-stats Schnittstelle, die wir vorhin in eurer App gefunden haben
    const response = await fetch("https://supercreator.app", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.SUPERCREATOR_API_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
      }
    });

    if (!response.ok) throw new Error(`Supercreator verweigert Zugriff: ${response.status}`);
    const jsonDaten = await response.json();
    return await verarbeiteUmsatzPaket(jsonDaten);

  } catch (error: any) {
    console.error("Supercreator-Server-Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 🚀 2. DER MANUELLE DIREKT-INJEKTOR (FÜR POWERSHELL ODER CHATTER-POOL)
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  try {
    const jsonDaten = await request.json();
    return await verarbeiteUmsatzPaket(jsonDaten);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// 🧠 GEMEINSAME VERARBEITUNGS-LOGIK (EGAL OB GET ODER POST)
async function verarbeiteUmsatzPaket(jsonDaten: any) {
  const roheListe = Array.isArray(jsonDaten) ? jsonDaten : (jsonDaten.data || jsonDaten.stats || jsonDaten.chatters || []);
  
  const chatterUmsaetze = roheListe.map((user: any) => ({
    scName: String(user.chatter_name || user.name || "").trim(),
    heuteUmsatz: parseFloat(user.today_revenue || user.revenue || user.umsatz || "0"),
    modelId: user.model_id || null
  }));

  const supabase = await createClient();
  const heuteISO = new Date().toISOString().split("T")[0];

  for (const data of chatterUmsaetze) {
    if (data.heuteUmsatz <= 0) continue;

    // Standard-Auffangbecken (deine Admin-ID) für unzugeordnete Trinkgelder / freie Tips!
    let zielUserId = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'; 

    if (data.scName && data.scName.toLowerCase() !== "unassigned" && data.scName.toLowerCase() !== "system") {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("full_name", data.scName)
        .maybeSingle();

      if (profile) zielUserId = profile.user_id;
    }

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
        { user_id: zielUserId, model_id: data.modelId, amount: differenz, created_at: new Date().toISOString() }
      ]);
    }
  }
  return NextResponse.json({ success: true, verarbeitet: chatterUmsaetze.length });
}
