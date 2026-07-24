import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/getCurrentUser";
import { vpsFetch } from "@/lib/vpsClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * "Fill with AI": scrapes the visible text of the currently-open OnlyFans
 * chat (via the user's own chatter slot) and asks an LLM to pull out
 * whatever it can infer about the fan - name, age, location, hobbies/
 * preferences, how they found the model - as suggestions the chatter can
 * accept or edit, not auto-saved.
 * POST /api/crm/fan-ai-suggest  Body: { modelId }
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        status: "not_configured",
        message: "ANTHROPIC_API_KEY ist nicht gesetzt - KI-Vorschläge sind noch nicht eingerichtet.",
      });
    }

    const { modelId } = await req.json();
    if (!modelId) {
      return NextResponse.json({ error: "Missing modelId" }, { status: 400 });
    }

    const textRes = await vpsFetch(
      `/chatter-slot-chat-text?userId=${encodeURIComponent(user.id)}&modelId=${encodeURIComponent(modelId)}`
    );
    if (!textRes.ok) {
      return NextResponse.json({ error: "VPS unreachable" }, { status: 502 });
    }
    const textData = await textRes.json();
    if (textData.status !== "success" || !textData.text) {
      return NextResponse.json({ status: "no_chat", message: "Kein offener Chat gefunden" });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Below is the raw visible text of an OnlyFans chat conversation page (it includes navigation labels and other page chrome mixed in with the actual messages - ignore anything that isn't a chat message). Based only on what the fan themselves has actually written, suggest values for these fields. Only include a field if there's real evidence for it in the text - never invent or guess without a basis. Respond with ONLY a JSON object, no other text, with exactly these keys: real_name, age, location, preferences (array of short strings - hobbies/interests/kinks actually mentioned), came_from (how they found the creator, if mentioned). Use null for any field with no evidence.

${textData.text}`,
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[FAN-AI-SUGGEST] Anthropic error:", anthropicRes.status, errText.slice(0, 300));
      return NextResponse.json({ error: "AI-Anfrage fehlgeschlagen" }, { status: 502 });
    }

    const anthropicData = await anthropicRes.json();
    const rawText = anthropicData?.content?.[0]?.text || "{}";
    let suggestions;
    try {
      suggestions = JSON.parse(rawText);
    } catch {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      suggestions = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    }

    return NextResponse.json({ status: "success", suggestions });
  } catch (error: any) {
    console.error("[FAN-AI-SUGGEST] Error:", error.message);
    return NextResponse.json({ error: error.message || "AI suggestion failed" }, { status: 500 });
  }
}
