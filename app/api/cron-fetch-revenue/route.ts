import { NextResponse } from "next/server";
import playwright from "playwright-core";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();

    // 1. Login bei Supercreator
    await page.goto("https://supercreator.app");
    await page.fill("input[type='email']", process.env.SUPERCREATOR_EMAIL || "");
    await page.fill("input[type='password']", process.env.SUPERCREATOR_PASSWORD || "");
    await page.click("button[type='submit']");
    
    // 2. Navigiere direkt zur Chatter-Performance-Übersicht
    await page.waitForURL("https://supercreator.app");
    await page.goto("https://supercreator.app/chatters");
    await page.waitForSelector(".chatter-row-class"); // Wartet auf die Mitarbeiter-Tabelle

    // 3. Holt die fertigen Tages-Umsätze pro Mitarbeiter aus Supercreator
    const chatterUmsaetze = await page.evaluate(() => {
      const zeilen = document.querySelectorAll(".chatter-row-class"); 
      return Array.from(zeilen).map(z => ({
        scName: z.querySelector(".chatter-name")?.textContent?.trim() || "", // Name in Supercreator (z.B. "Leon")
        heuteUmsatz: z.querySelector(".today-revenue")?.textContent?.trim() || "0"
      }));
    });
    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T")[0]; // Das heutige Datum (YYYY-MM-DD)

    for (const data of chatterUmsaetze) {
      const supercreatorUmsatz = parseFloat(data.heuteUmsatz.replace("$", "").replace(",", ""));
      if (supercreatorUmsatz <= 0 || !data.scName) continue;

      // 4. Suche das passende Mitarbeiter-Profil in deiner Datenbank über den Namen
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("full_name", data.scName) // Sucht nach dem Namen (Groß-/Kleinschreibung egal)
        .maybeSingle();

      if (profile) {
        // 5. Prüfe, was heute bereits für diesen User verbucht wurde
        const { data: bestehendeRevenues } = await supabase
          .from("chatter_revenues")
          .select("amount")
          .eq("user_id", profile.user_id)
          .gte("created_at", `${heuteISO}T00:00:00`)
          .lte("created_at", `${heuteISO}T23:59:59`);

        const bereitsVerbucht = (bestehendeRevenues || []).reduce((sum, r) => sum + Number(r.amount || 0), 0);
        
        // Berechne die Differenz (was seit dem letzten Cronjob neu dazugekommen ist)
        const differenz = supercreatorUmsatz - bereitsVerbucht;

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

    await browser.close();
    return NextResponse.json({ success: true, verarbeiteteMitarbeiter: chatterUmsaetze.length });

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("Supercreator-Chatter-Abgleich Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
