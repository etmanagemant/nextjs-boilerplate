import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Streams a Vault thumbnail image through the VPS instead of loading it
 * directly in the admin's browser - the URLs from /api/crm/vault-media
 * are AWS CloudFront-signed with an IpAddress condition locked to the
 * VPS's own outbound IP (OnlyFans' anti-hotlinking measure), so the
 * admin's own browser gets rejected loading them directly. The VPS
 * fetches the actual bytes (from the allowed IP) and this just relays
 * them - used directly as an <img src>.
 * GET ?url=<encoded CloudFront URL>
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.searchParams.get("url");
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    const vpsRes = await vpsFetch(`/vault-thumbnail?url=${encodeURIComponent(url)}`, { method: "GET" });
    if (!vpsRes.ok) {
      return NextResponse.json({ error: "Thumbnail unreachable" }, { status: 502 });
    }
    const buffer = await vpsRes.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": vpsRes.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: any) {
    console.error("[VAULT-THUMBNAIL] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
