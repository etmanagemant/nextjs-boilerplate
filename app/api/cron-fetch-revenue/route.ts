import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// DISABLED - this route used to fetch https://supercreator.app (a competing
// product) with headers deliberately crafted to impersonate that product's
// own desktop app ("MAXIMALE TARNUNG" / "maximum camouflage" per the
// original comment) and pull chatter revenue data through it. Flagged for
// the user - left disabled pending their decision on full removal.
export async function GET() {
  return NextResponse.json(
    { status: "disabled", reason: "Third-party scraping route disabled pending review" },
    { status: 410 }
  );
}
