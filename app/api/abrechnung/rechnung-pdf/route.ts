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
 * Explizit gewuenscht (2026-08-07): Chatter/Moderator sollen sich SELBST
 * eine Rechnung an die Agentur stellen koennen (umgekehrte Richtung zur
 * Admin-Auszahlungs-PDF unter /api/buchhaltung/abrechnung-pdf - hier ist
 * der Mitarbeiter der Rechnungssteller, die Agentur der Empfaenger, wie
 * bei einem echten Freelancer). Loggt jede Erzeugung in crm_invoices,
 * damit Admin auf /buchhaltung sieht, wer wann fuer welchen Monat eine
 * Rechnung gezogen hat - kein PDF-Binary gespeichert, wird bei Bedarf aus
 * denselben Daten deterministisch neu erzeugt.
 * GET ?monat=0 (eigene Rechnung) oder ?userId=X&monat=0 (Admin sieht/holt
 * die Rechnung eines bestimmten Mitarbeiters erneut).
 */
export async function GET(req: NextRequest) {
  const { supabase, user } = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile = await getCurrentProfile(user.id);

  const { searchParams } = new URL(req.url);
  const requestedUserId = searchParams.get("userId");
  const monthOffset = Math.max(0, Number(searchParams.get("monat")) || 0);

  let targetUserId = user.id;
  if (requestedUserId && requestedUserId !== user.id) {
    const granted = await fetchRolePermissionMap(supabase, profile?.role);
    const isAdminAllowed =
      user.email === "etmanagement@gmail.com" ||
      user.email === "etmanagemant@gmail.com" ||
      hasFeatureAccess(profile?.role, "buchhaltung", granted);
    if (!isAdminAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    targetUserId = requestedUserId;
  }

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
  if (!targetProfile) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
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

  let netto = 0;
  (revenueRes.data || []).forEach((r: any) => {
    if ((r.user_id || r.chatter_id) === targetUserId && r.platform !== "stripchat") {
      netto += Number(r.amount || 0);
    }
  });

  const provisionsSatz = Number(targetProfile.provision_rate || 20);
  const hourlyRate = Number(targetProfile.hourly_rate || 0);
  const isModerator = targetProfile.role === "moderator";
  const betrag = isModerator ? stunden * hourlyRate + praemie : netto * (provisionsSatz / 100);

  // Einfache, deterministische Rechnungsnummer statt eigenem Zaehler-
  // Mechanismus: Jahr-Monat + die ersten 6 Zeichen der User-ID.
  const rechnungsnummer = `${monthDate.getFullYear()}${String(monthDate.getMonth() + 1).padStart(2, "0")}-${targetUserId.slice(0, 6).toUpperCase()}`;

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const bufferPromise = streamToBuffer(doc);

  doc.fontSize(10).fillColor("#333").text(String(targetProfile.rechnungs_adresse || targetProfile.full_name || "Mitarbeiter"));
  doc.moveDown(1);
  doc.text(`An: ${agency.agency_name || "ET Management"}`);
  if (agency.address) doc.text(String(agency.address));
  doc.moveDown(1.5);

  doc.fontSize(16).fillColor("#1a1a1a").text("Rechnung");
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor("#555");
  doc.text(`Rechnungsnummer: ${rechnungsnummer}`);
  doc.text(`Rechnungsdatum: ${new Date().toLocaleDateString("de-DE")}`);
  doc.text(`Leistungszeitraum: ${monthLabel} (01. bis letzter Tag des Monats)`);
  if (targetProfile.steuer_id) doc.text(`Steuernummer: ${targetProfile.steuer_id}`);
  doc.moveDown(1.5);

  doc.fontSize(11).fillColor("#1a1a1a").text("Leistung", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#333");
  if (isModerator) {
    doc.text(`Chat-/Moderations-Tätigkeit ${monthLabel}: ${stunden.toFixed(2)} h à $${hourlyRate.toFixed(2)}/h`);
    if (praemie > 0) doc.text(`Prämie (${privatShowCount} Private Shows): $${praemie.toFixed(2)}`);
  } else {
    doc.text(`Chat-Tätigkeit ${monthLabel}: Provision ${provisionsSatz}% auf $${netto.toFixed(2)} Netto-Umsatz`);
  }
  doc.moveDown(1);

  doc.fontSize(13).fillColor("#9C7A3D").text(`Gesamtbetrag: $${betrag.toFixed(2)}`, { underline: true });
  doc.moveDown(2);

  if (targetProfile.zahlungs_methode) doc.fontSize(9).fillColor("#555").text(`Zahlung via: ${targetProfile.zahlungs_methode}`);
  if (targetProfile.zahlungs_details) doc.fontSize(9).fillColor("#555").text(`Zahlungsdetails: ${targetProfile.zahlungs_details}`);

  doc.end();
  const buffer = await bufferPromise;

  // Log-Eintrag fuer die Admin-Ansicht auf /buchhaltung - ein Eintrag pro
  // Mitarbeiter+Monat, wird bei erneutem Ziehen einfach aktualisiert statt
  // dupliziert (siehe UNIQUE(user_id, month_start) in der Migration).
  await admin.from("crm_invoices").upsert(
    {
      user_id: targetUserId,
      month_start: monthStart.toISOString().slice(0, 10),
      amount: betrag,
      invoice_number: rechnungsnummer,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,month_start" }
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Rechnung_${rechnungsnummer}.pdf"`,
    },
  });
}
