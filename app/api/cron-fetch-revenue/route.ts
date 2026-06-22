import { NextResponse } from "next/server";
import playwright from "playwright-core";
// 🛡️ PFAD-FIX: Genau 3 Ebenen nach oben springen, um utils/supabase/server zu treffen
import { createClient } from "../../../utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // 🛡️ PRODUKTIONS-SCHUTZ: Lässt nur den automatischen GitHub-Taktgeber rein!
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Nicht autorisiert', { status: 401 });
  }

  let browser;
  try {
    // 🛡️ SERVER-STEALTH-MODUS: Läuft unsichtbar (headless: true) und getarnt auf dem Server!
    browser = await playwright.chromium.launch({ 
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled', // Versteckt den Playwright-Bot-Status
        '--use-fake-ui-for-media-stream',
        '--window-size=1920,1080'
      ]
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();

    // 1. Rufe die Login-Seite auf
    await page.goto("https://supercreator.app", { waitUntil: "networkidle" });
    await page.waitForTimeout(4000); 

    // Schritt A: E-Mail unblockierbar aus den Vercel-Environment-Variables injizieren
    await page.evaluate((email) => {
      const emailInput = document.querySelector("input[type='email'], input[id='email'], input[name='email']") as HTMLInputElement;
      if (emailInput && email) {
        emailInput.value = email;
        emailInput.dispatchEvent(new Event('input', { bubbles: true }));
        emailInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, process.env.SUPERCREATOR_EMAIL);
    
    // Schritt B: Zwei-Schritt-Login fortsetzen
    await page.locator("input[type='email']").first().click();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);

    // Schritt C: Passwort unblockierbar aus den Vercel-Variables injizieren
    await page.evaluate((pass) => {
      const passwordInput = document.querySelector("input[type='password']") as HTMLInputElement;
      if (passwordInput && pass) {
        passwordInput.value = pass;
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, process.env.SUPERCREATOR_PASSWORD);

    // Schritt D: Per Tastatur einloggen (Tarnung als echter Mensch)
    await page.locator("input[type='password']").first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Tab");
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");
    
    // 2. Navigiere zur Performance-Übersicht
    await page.waitForURL("**/analytics**", { timeout: 30000 });
    await page.goto("https://supercreator.app");
    await page.waitForSelector(".chatter-row-class", { timeout: 20000 });

    // 3. Einnahmen vom Bildschirm ablesen
    const chatterUmsaetze = await page.evaluate(() => {
      const zeilen = document.querySelectorAll(".chatter-row-class"); 
      return Array.from(zeilen).map(z => ({
        scName: z.querySelector(".chatter-name")?.textContent?.trim() || "",
        heuteUmsatz: z.querySelector(".today-revenue")?.textContent?.trim() || "0"
      }));
    });
    const supabase = await createClient();
    const heuteISO = new Date().toISOString().split("T"); // Format: YYYY-MM-DD

    for (const data of chatterUmsaetze) {
      const supercreatorUmsatz = parseFloat(data.heuteUmsatz.replace("$", "").replace(",", ""));
      if (supercreatorUmsatz <= 0 || !data.scName) continue;

      // 4. Suche den Mitarbeiter in der DB
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .ilike("full_name", data.scName)
        .maybeSingle();

      if (profile) {
        // 5. Bereits gebuchte Umsätze abfragen
        const { data: bRevenues } = await supabase
          .from("chatter_revenues")
          .select("amount")
          .eq("user_id", profile.user_id)
          .gte("created_at", `${heuteISO}T00:00:00`)
          .lte("created_at", `${heuteISO}T23:59:59`);

        const bereitsVerbucht = (bRevenues || []).reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
        const differenz = supercreatorUmsatz - bereitsVerbucht;

        if (differenz > 0.01) {
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
    return NextResponse.json({ success: true, verarbeiteteMitarbeiter: chatterUmsaetze.length, daten: chatterUmsaetze });

  } catch (error: any) {
    if (browser) await browser.close();
    console.error("Supercreator-Chatter-Abgleich Fehler:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
