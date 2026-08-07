import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasFeatureAccess } from "@/lib/roles";
import { fetchRolePermissionMap } from "@/lib/getRolePermissions";
import { createSupabaseAdminClient } from "@/lib/supabaseServerClient";
import PDFDocument from "pdfkit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TEST_MODEL_ID = "d7976e92-434e-488a-8ec4-bba92eb31dcf";

function streamToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/**
 * Explizit gewuenscht (2026-08-07): der "Abrechnung PDF laden"-Button in
 * /buchhaltung war komplett unverdrahtet. Rechnet dieselbe Auszahlung wie
 * /abrechnung (Moderator = Stundenhonorar+Praemie, Chatter = Provision%)
 * eigenstaendig fuer genau einen Mitarbeiter+Monat neu, statt Zahlen aus
 * dem Client zu uebernehmen - ein PDF ueber ungeprueften Client-Input waere
 * faelschbar. Admin-only, gleiche Absicherung wie die Buchhaltung-Seite
 * selbst.
 * GET ?userId=X&monat=0 (0 = aktueller Monat, hoeher = weiter zurueck)
 */
export async function GET(req: NextRequest) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getCurrentProfile(user.id);
  const granted = await fetchRolePermissionMap(supabase, profile?.role);
  const isAllowed =
    user.email === "etmanagement@gmail.com" ||
    user.email === "etmanagemant@gmail.com" ||
    hasFeatureAccess(profile?.role, "buchhaltung", granted);
  if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const targetUserId = searchParams.get("userId");
  const monthOffset = Math.max(0, Number(searchParams.get("monat")) || 0);
  if (!targetUserId) return NextResponse.json({ error: "Missing userId" }, { status: 400 });

  const now = new Date();
  const monthDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1);
  const monthLabel = monthDate.toLocaleDateString("de-DE", { month: "long", year: "numeric" });

  const admin = createSupabaseAdminClient();
  const [agencyRes, targetProfileRes, shiftsRes, revenueRes] = await Promise.all([
    admin.from("agency_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("profiles").select("*").eq("user_id", targetUserId).maybeSingle(),
    admin.from("shift_assignments").select("*")
      .gte("started_at", monthStart.toISOString()).lt("started_at", monthEnd.toISOString()),
    admin.from("chatter_revenues").select("*")
      .gte("created_at", monthStart.toISOString()).lt("created_at", monthEnd.toISOString())
      .neq("model_id", TEST_MODEL_ID),
  ]);

  const targetProfile = targetProfileRes.data;
  if (!targetProfile) return NextResponse.json({ error: "Mitarbeiter nicht gefunden" }, { status: 404 });
  const agency = agencyRes.data || { agency_name: "ET Management", address: null, tax_id: null, bank_details: null };

  let stunden = 0;
  let privatShowCount = 0;
  (shiftsRes.data || []).forEach((s: any) => {
    if ((s.chatter_id || s.user_id) === targetUserId && s.started_at) {
      const von = new Date(s.started_at).getTime();
      const bis = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
      if (bis > von) stunden += (bis - von) / (1000 * 60 * 60);
      if (s.privateshow_count) privatShowCount += Number(s.privateshow_count);
    }
  });

  let praemie = 0;
  if (targetProfile.role === "moderator") {
    if (privatShowCount >= 25) praemie = 70;
    else if (privatShowCount >= 20) praemie = 50;
    else if (privatShowCount >= 15) praemie = 30;
  }

  let brutto = 0;
  let netto = 0;
  let striptchatBrutto = 0;
  let striptchatNetto = 0;
  (revenueRes.data || []).forEach((r: any) => {
    if ((r.user_id || r.chatter_id) === targetUserId) {
      const bruttoWert = Number(r.gross_amount || r.amount || 0);
      const nettoWert = Number(r.amount || 0);
      if (r.platform === "stripchat") {
        striptchatBrutto += bruttoWert;
        striptchatNetto += nettoWert;
      } else {
        brutto += bruttoWert;
        netto += nettoWert;
      }
    }
  });

  const provisionsSatz = Number(targetProfile.provision_rate || 20);
  const hourlyRate = Number(targetProfile.hourly_rate || 0);
  const isModerator = targetProfile.role === "moderator";
  const auszahlung = isModerator ? stunden * hourlyRate + praemie : netto * (provisionsSatz / 100);

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = streamToBuffer(doc);

  doc.fontSize(18).fillColor("#1a1a1a").text(String(agency.agency_name || "ET Management"), { align: "left" });
  if (agency.address) doc.fontSize(9).fillColor("#555").text(String(agency.address));
  if (agency.tax_id) doc.fontSize(9).fillColor("#555").text(`USt-ID: ${agency.tax_id}`);
  doc.moveDown(1.5);

  doc.fontSize(14).fillColor("#1a1a1a").text(`Abrechnung — ${monthLabel}`);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#333");
  doc.text(`Mitarbeiter: ${targetProfile.full_name || "Mitarbeiter"}`);
  doc.text(`E-Mail: ${targetProfile.email || "-"}`);
  doc.text(`Rolle: ${isModerator ? "Moderator" : "Chatter"}`);
  if (targetProfile.zahlungs_methode) doc.text(`Zahlungsmethode: ${targetProfile.zahlungs_methode}`);
  if (targetProfile.zahlungs_details) doc.text(`Zahlungsdetails: ${targetProfile.zahlungs_details}`);
  doc.moveDown(1);

  doc.fontSize(11).fillColor("#1a1a1a").text("Leistungsübersicht", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#333");
  doc.text(`Arbeitszeit: ${stunden.toFixed(2)} h`);
  if (isModerator) {
    doc.text(`Stundenhonorar: $${hourlyRate.toFixed(2)}/h -> $${(stunden * hourlyRate).toFixed(2)}`);
    doc.text(`Private-Show-Anzahl: ${privatShowCount}`);
    doc.text(`Prämie: $${praemie.toFixed(2)}`);
    doc.text(`Stripchat Brutto: $${striptchatBrutto.toFixed(2)}`);
  } else {
    doc.text(`Umsatz Brutto: $${brutto.toFixed(2)}`);
    doc.text(`Umsatz Netto: $${netto.toFixed(2)}`);
    doc.text(`Provisionssatz: ${provisionsSatz}%`);
  }
  doc.moveDown(1);

  doc.fontSize(13).fillColor("#9C7A3D").text(`Gesamtauszahlung: $${auszahlung.toFixed(2)}`, { underline: true });
  doc.moveDown(2);

  if (agency.bank_details) {
    doc.fontSize(8).fillColor("#888").text(`Zahlungsdaten Agentur: ${agency.bank_details}`);
  }
  doc.fontSize(8).fillColor("#888").text(`Erstellt am ${new Date().toLocaleDateString("de-DE")}`);

  doc.end();
  const buffer = await bufferPromise;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Abrechnung_${(targetProfile.full_name || "Mitarbeiter").replace(/[^a-zA-Z0-9]/g, "_")}_${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}.pdf"`,
    },
  });
}
