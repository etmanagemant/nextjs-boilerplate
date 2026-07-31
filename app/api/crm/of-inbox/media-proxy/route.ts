import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streams OnlyFans media (photo/video/audio) through the VPS instead of
 * handing the browser the raw CDN url - see /of-media-proxy in
 * app/vps-server.js for why (CloudFront's signed policy is IP-locked to
 * the VPS, not the CRM user's browser - direct urls 403'd, Task #44).
 * GET /api/crm/of-inbox/media-proxy?url=<encoded CDN url>
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get("url");
    if (!url || !/^https:\/\/[a-z0-9.-]+\.onlyfans\.com\//i.test(url)) {
      return NextResponse.json({ error: "Invalid url" }, { status: 400 });
    }

    const range = req.headers.get("range");
    const vpsRes = await vpsFetch(`/of-media-proxy?url=${encodeURIComponent(url)}`, {
      headers: range ? { Range: range } : {},
    });
    if (!vpsRes.ok && vpsRes.status !== 206) {
      return NextResponse.json({ error: "Media fetch failed" }, { status: vpsRes.status });
    }

    const headers = new Headers();
    for (const h of ["content-type", "content-length", "accept-ranges", "content-range"]) {
      const v = vpsRes.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new NextResponse(vpsRes.body, { status: vpsRes.status, headers });
  } catch (error: any) {
    console.error("[OF-INBOX-MEDIA-PROXY] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to load media" }, { status: 500 });
  }
}
