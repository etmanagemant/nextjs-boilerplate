/**
 * ⚠️ DEPRECATED - This file contains OLD code that calls /login endpoint
 * 
 * The new architecture uses separate subfolder routes:
 * - /api/crm/browser-login/init - POST to start session
 * - /api/crm/browser-login/verify - GET to poll login status
 * - /api/crm/browser-login/confirm - POST to save session
 * 
 * DO NOT USE THIS ROUTE - It will cause VPS 500 errors!
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.json(
    {
      status: "error",
      error: "This route is deprecated. Use /api/crm/browser-login/init, /verify, /confirm instead",
      deprecated: true,
    },
    { status: 410 }
  );
}
