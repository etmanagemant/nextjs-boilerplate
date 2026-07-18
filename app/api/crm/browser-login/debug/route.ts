import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const vpsUrl = process.env.VPS_API_URL;

  console.log("[DEBUG] VPS_API_URL:", vpsUrl);

  if (!vpsUrl) {
    return NextResponse.json({
      status: "error",
      message: "VPS_API_URL not set",
      vpsUrl: null,
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${vpsUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await response.text();

    return NextResponse.json({
      status: "ok",
      vpsUrl,
      vpsHealthResponse: data,
      vpsHealthOk: response.ok,
      statusCode: response.status,
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      vpsUrl,
      error: error.message,
    });
  }
}
