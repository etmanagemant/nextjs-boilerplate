import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxies to the VPS's /of-fan-rename - OnlyFans' own real rename feature
 * (Task #43), replacing the old crm_fan_nicknames table.
 * PUT Body: { modelId, fanId, displayName }
 */
export async function PUT(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getCurrentProfile(user.id);
    const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
      user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
      user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
    if (!isAllowed) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    const { modelId, fanId, displayName } = await req.json();
    if (!modelId || !fanId || typeof displayName !== "string") {
      return NextResponse.json({ error: "Missing modelId, fanId, or displayName" }, { status: 400 });
    }

    const vpsRes = await vpsFetch("/of-fan-rename", { method: "PUT", body: JSON.stringify({ modelId, fanId, displayName }) });
    const data = await vpsRes.json();
    if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[OF-INBOX-FAN-RENAME] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed to rename fan" }, { status: 500 });
  }
}
