import { createClient } from "@/utils/supabase/server";
import { vpsFetch } from "@/lib/vpsClient";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Send a message to OnlyFans on behalf of the connected model.
 * POST /api/crm/send-message-to-onlyfans
 * Body: { fanId, messageText, localMessageId }
 *
 * Reuses the model's live, already-authenticated VPS session (see
 * /sync-live on the VPS for why) instead of the old Browserless
 * cookie-clone approach, which got rejected by OnlyFans even with valid
 * cookies - meaning messages sent from Native Chat Mode were previously
 * saved locally but never actually reached the fan. Opportunistic: if
 * nobody currently has this model connected, the message stays saved
 * locally (sent:false, skipped:true) instead of erroring.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fanId, messageText, localMessageId } = body;

    if (!fanId || !messageText || !localMessageId) {
      return NextResponse.json(
        { error: "Missing required fields: fanId, messageText, localMessageId" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized: User not authenticated" }, { status: 401 });
    }

    const { data: fanMeta, error: fanMetaError } = await supabase
      .from("crm_fan_metadata")
      .select("model_id")
      .eq("fan_id", fanId)
      .maybeSingle();

    if (fanMetaError || !fanMeta?.model_id) {
      console.error("Fan metadata not found:", fanMetaError);
      return NextResponse.json(
        { error: "Fan metadata not found for this conversation", sent: false },
        { status: 404 }
      );
    }

    const vpsResponse = await vpsFetch("/send-message", {
      method: "POST",
      body: JSON.stringify({ modelId: fanMeta.model_id, fanId, text: messageText }),
    });

    if (!vpsResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          sent: false,
          message: "VPS unreachable - message saved locally, will retry",
          localMessageId,
          retryable: true,
        },
        { status: 200 }
      );
    }

    const vpsResult = await vpsResponse.json();

    if (vpsResult.status === "no_live_session") {
      return NextResponse.json({
        success: false,
        sent: false,
        message: "No live session open for this model right now - message saved locally",
        localMessageId,
        skipped: true,
      });
    }

    if (vpsResult.status !== "success" || !vpsResult.data?.ok) {
      console.warn("OnlyFans send failed:", vpsResult.error || vpsResult.data);
      return NextResponse.json(
        {
          success: false,
          sent: false,
          message: "Failed to send to OnlyFans",
          error: vpsResult.error || vpsResult.data,
          localMessageId,
          retryable: true,
        },
        { status: 200 }
      );
    }

    const messageId = vpsResult.data.json?.id ?? vpsResult.data.json?.result?.id ?? null;

    const { error: updateError } = await supabase
      .from("crm_fan_messages")
      .update({
        sent_to_platform: true,
        external_message_id: messageId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", localMessageId);

    if (updateError) {
      console.error("Failed to update message status:", updateError);
    }

    return NextResponse.json({
      success: true,
      sent: true,
      message: "Message sent successfully to OnlyFans",
      localMessageId,
      externalMessageId: messageId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[SEND-MESSAGE-TO-OF] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
