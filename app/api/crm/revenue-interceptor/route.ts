import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/revenue-interceptor
 * 
 * Automated chatter payout dispatcher triggered by OnlyFans earnings sync.
 * Maps transactions to responsible chatters and injects into chatter_revenues table.
 */

interface PaymentData {
  model_id: string;
  fan_id: string;
  onlyfans_transaction_id: string;
  gross_amount: number;
  type: "tip" | "ppv_unlock";
}

const ADMIN_FALLBACK_ID = "35498c92-2c4d-4720-a6f7-cc187a4c5fc4";
const PLATFORM_FEE_RATE = 0.80; // 20% OF fee = 80% to chatter

export async function POST(request: NextRequest) {
  try {
    // 🔐 AUTHENTICATE REQUEST
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: No authenticated user" },
        { status: 401 }
      );
    }

    // 📥 EXTRACT PAYMENT DATA
    let body: PaymentData;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON payload" },
        { status: 400 }
      );
    }

    const { model_id, fan_id, onlyfans_transaction_id, gross_amount, type } = body;

    // ✅ VALIDATE REQUIRED FIELDS
    if (!model_id || !fan_id || !onlyfans_transaction_id || !gross_amount || !type) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          required: ["model_id", "fan_id", "onlyfans_transaction_id", "gross_amount", "type"]
        },
        { status: 400 }
      );
    }

    // Validate gross_amount is positive
    if (typeof gross_amount !== "number" || gross_amount <= 0) {
      return NextResponse.json(
        { error: "gross_amount must be a positive number" },
        { status: 400 }
      );
    }

    // Validate type
    if (!["tip", "ppv_unlock"].includes(type)) {
      return NextResponse.json(
        { error: "type must be either 'tip' or 'ppv_unlock'" },
        { status: 400 }
      );
    }

    console.log(`[Revenue Interceptor] Processing: TX=${onlyfans_transaction_id}, Model=${model_id}, Fan=${fan_id}, Amount=$${gross_amount}`);

    // 🔍 PREVENT DOUBLE COUNTING
    const { data: existingRevenue, error: checkError } = await supabase
      .from("chatter_revenues")
      .select("id")
      .eq("transaction_id", onlyfans_transaction_id)
      .limit(1);

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Check for duplicate error:", checkError);
      return NextResponse.json(
        { error: "Database query failed", details: checkError.message },
        { status: 500 }
      );
    }

    if (existingRevenue && existingRevenue.length > 0) {
      console.warn(`[Revenue Interceptor] Duplicate detected: TX=${onlyfans_transaction_id}`);
      return NextResponse.json(
        {
          error: "Transaction already processed",
          transaction_id: onlyfans_transaction_id,
          status: "duplicate"
        },
        { status: 409 }
      );
    }

    // 👤 IDENTIFY THE RESPONSIBLE CHATTER
    let chatterId: string = ADMIN_FALLBACK_ID;
    let chatLogFound = false;

    const { data: chatLog, error: chatLogError } = await supabase
      .from("crm_chat_logs")
      .select("chatter_id")
      .eq("model_id", model_id)
      .eq("fan_id", fan_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (chatLogError) {
      console.warn(`[Revenue Interceptor] Chat log query error: ${chatLogError.message}`);
    } else if (chatLog?.chatter_id) {
      chatterId = chatLog.chatter_id;
      chatLogFound = true;
      console.log(`[Revenue Interceptor] Chatter identified from chat log: ${chatterId}`);
    } else {
      console.warn(`[Revenue Interceptor] No chat log found for Model=${model_id}, Fan=${fan_id}. Using fallback admin account.`);
    }

    // 💰 CALCULATE NET AMOUNT (OnlyFans takes 20%)
    const netAmount = parseFloat((gross_amount * PLATFORM_FEE_RATE).toFixed(2));

    // 📊 INSERT TO CHATTER_REVENUES
    const { data: insertedRevenue, error: insertError } = await supabase
      .from("chatter_revenues")
      .insert({
        user_id: chatterId,
        model_id: model_id,
        gross_amount: gross_amount,
        amount: netAmount,
        platform: "onlyfans",
        transaction_id: onlyfans_transaction_id,
        transaction_type: type,
        fan_id: fan_id,
        chatter_found: chatLogFound,
        created_at: new Date().toISOString()
      })
      .select();

    if (insertError) {
      console.error("[Revenue Interceptor] Insert error:", insertError);
      return NextResponse.json(
        {
          error: "Failed to insert revenue record",
          details: insertError.message
        },
        { status: 500 }
      );
    }

    if (!insertedRevenue || insertedRevenue.length === 0) {
      return NextResponse.json(
        { error: "Insert succeeded but no record returned" },
        { status: 500 }
      );
    }

    const revenue = insertedRevenue[0];

    console.log(`[Revenue Interceptor] ✅ Success: Revenue ID=${revenue.id}, Chatter=${chatterId}, Net=$${netAmount}`);

    // ✅ RETURN SUCCESS RESPONSE
    return NextResponse.json(
      {
        success: true,
        revenue: {
          id: revenue.id,
          user_id: chatterId,
          model_id: model_id,
          gross_amount: gross_amount,
          amount: netAmount,
          platform_fee: (gross_amount - netAmount).toFixed(2),
          transaction_id: onlyfans_transaction_id,
          type: type,
          chatter_identified: chatLogFound
        }
      },
      { status: 201 }
    );

  } catch (error) {
    console.error("[Revenue Interceptor] Uncaught error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
