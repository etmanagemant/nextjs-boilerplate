import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Debug endpoint for OnlyFans connection
 * GET /api/crm/debug?modelId=xxx
 * 
 * Tests connection to Puppeteer VPS server
 */
export async function GET(request: NextRequest) {
  const modelId = request.nextUrl.searchParams.get("modelId");

  if (!modelId) {
    return NextResponse.json({
      error: "Missing modelId",
    }, { status: 400 });
  }

  try {
    const vpsUrl = process.env.VPS_API_URL;
    if (!vpsUrl) {
      return NextResponse.json({
        status: "vps_not_configured",
        error: "VPS_API_URL not set",
      }, { status: 500 });
    }

    console.log("[DEBUG] Testing VPS connection...");
    const vpsEndpoint = `${vpsUrl}/debug?modelId=${encodeURIComponent(modelId)}`;

    // Forward to VPS server
    const response = await fetch(vpsEndpoint, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`VPS returned ${response.status}`);
    }

    const data = await response.json();

    return NextResponse.json({
      status: "healthy",
      modelId,
      vps: data,
      message: "VPS is reachable",
    });
  } catch (err: any) {
    console.error("[DEBUG] Error:", err?.message);
    return NextResponse.json({
      status: "error",
      modelId,
      error: err?.message || "VPS connection failed",
    }, { status: 500 });
  }
}
