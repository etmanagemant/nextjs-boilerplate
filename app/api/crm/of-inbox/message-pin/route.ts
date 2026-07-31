import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getCurrentProfile } from "@/lib/getCurrentUser";
import { hasRole, isAdminTierRole } from "@/lib/roles";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function checkAuth() {
  const { user } = await getCurrentUser();
  if (!user) return null;
  const profile = await getCurrentProfile(user.id);
  const isAllowed = hasRole(profile, "chatter") || isAdminTierRole(profile?.role) ||
    user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
    user.email === "etmanagement@gmail.com" || user.email === "etmanagemant@gmail.com";
  return isAllowed ? user : null;
}

/**
 * Proxies to the VPS's /of-message-pin - pin/unpin a chat message (Task #55).
 * POST/DELETE Body: { modelId, fanId, messageId }
 */
export async function POST(req: NextRequest) {
  const user = await checkAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { modelId, fanId, messageId } = await req.json();
  if (!modelId || !fanId || !messageId) return NextResponse.json({ error: "Missing modelId, fanId, or messageId" }, { status: 400 });
  const vpsRes = await vpsFetch("/of-message-pin", { method: "POST", body: JSON.stringify({ modelId, fanId, messageId }) });
  const data = await vpsRes.json();
  if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const user = await checkAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { modelId, fanId, messageId } = await req.json();
  if (!modelId || !fanId || !messageId) return NextResponse.json({ error: "Missing modelId, fanId, or messageId" }, { status: 400 });
  const vpsRes = await vpsFetch("/of-message-pin", { method: "DELETE", body: JSON.stringify({ modelId, fanId, messageId }) });
  const data = await vpsRes.json();
  if (!vpsRes.ok) return NextResponse.json({ error: data.error || "VPS error" }, { status: vpsRes.status });
  return NextResponse.json(data);
}
