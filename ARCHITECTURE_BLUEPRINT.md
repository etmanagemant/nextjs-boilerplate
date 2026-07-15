# ETMANAGEMENT CRM - TECHNICAL ARCHITECTURE BLUEPRINT

**Generated:** 2026-07-15 | **Framework:** Next.js 16.2.9 (App Router) | **Runtime:** Vercel Serverless

---

## 1. ACTIVE FILE TREES & ROUTES

### Page Routes (Server-Side Rendered)
```
app/page.tsx                              → "/" (Root landing / dashboard redirect)
app/login/page.tsx                        → "/login" (Auth entry point)
app/dashboard/page.tsx                    → "/dashboard" (Revenue dashboard - role-specific view)
app/management/page.tsx                   → "/management" (Admin: staff & models management)
app/management/crm-connect/page.tsx       → "/management/crm-connect" (Admin: OnlyFans/Stripchat connector)
app/management/crm-vault/page.tsx         → "/management/crm-vault" (Admin: script library & vault)
app/crm-inbox/page.tsx                    → "/crm-inbox" (Chatter: live chat inbox)
app/chatter/page.tsx                      → "/chatter" (Chatter: profile & config)
app/content-plan/page.tsx                 → "/content-plan" (Content scheduling)
app/abrechnung/page.tsx                   → "/abrechnung" (Accounting/billing)
app/buchhaltung/page.tsx                  → "/buchhaltung" (Finance reports)
app/massmessage/page.tsx                  → "/massmessage" (Bulk messaging)
app/bewerbungen/page.tsx                  → "/bewerbungen" (Applications/submissions)
```

### API Routes
```
app/api/crm/browser-login/route.ts        → POST /api/crm/browser-login
  ↳ Initiates Browserless session
  ↳ Navigates OnlyFans/Stripchat login flow
  ↳ Extracts auth cookies → saves to crm_model_sessions

app/api/crm/browser-login/status/route.ts → GET /api/crm/browser-login/status?modelId={id}
  ↳ Polls authentication state (3s intervals)
  ↳ Returns: { authenticated: boolean, status: "authenticated"|"pending"|"error" }

app/api/crm/revenue-interceptor/route.ts   → POST /api/crm/revenue-interceptor
  ↳ Webhook: receives daily revenue sync from source system
  ↳ Upserts into chatter_revenues table

app/api/cron-fetch-revenue/route.ts        → GET /api/cron-fetch-revenue
  ↳ Scheduled: daily cron job (Vercel)
  ↳ Fetches revenues from external API
  ↳ Calculates gross/net splits

app/api/funnel-submissions/route.ts        → POST /api/funnel-submissions
  ↳ Webhook: captures funnel submissions (signup, contact forms)
  ↳ Stores in funnel_submissions table

app/api/upload-content/route.ts            → POST /api/upload-content
  ↳ File upload: content media to Supabase Storage
  ↳ Returns signed URL for crm_vault_media

app/api/logout/route.ts                    → POST /api/logout
  ↳ Session termination + auth cleanup
```

---

## 2. DATABASE STATE & SCHEMA

### Core Tables

#### `crm_model_sessions` (Active Browser Sessions)
```sql
id UUID PK
model_id UUID (FK → models.id) [UNIQUE]
auth_cookies JSONB
  ├─ cookies: Array<{name, value, domain, path, expires, httpOnly, secure, sameSite}>
  ├─ extractedAt: ISO timestamp
  └─ source: "browserless"
is_active BOOLEAN
last_verified_at TIMESTAMP WITH TZ
created_at TIMESTAMP WITH TZ
updated_at TIMESTAMP WITH TZ

Indices: model_id, is_active, created_at
RLS Policy: Hardcoded admin UUID OR (profiles.role = 'admin')
```

#### `crm_vault_media` (Script Library & Content Vault)
```sql
id UUID PK
chatter_id UUID (FK → profiles.user_id)
media_url VARCHAR(1000)
media_type VARCHAR(50)      -- 'video', 'image', 'document'
preview_url VARCHAR(1000)
file_size_bytes BIGINT
mime_type VARCHAR(100)
created_at TIMESTAMP WITH TZ

Indices: chatter_id, created_at
```

#### `crm_chatter_emojis` (Smiley Quick-Select Configuration)
```sql
id UUID PK
chatter_id UUID (FK → profiles.user_id) [UNIQUE]
emoji_list TEXT[] ARRAY DEFAULT ['😊', '😂', '🔥', '❤️', '😍', '👏', '🎉']
is_default BOOLEAN
created_at TIMESTAMP WITH TZ
updated_at TIMESTAMP WITH TZ

Indices: chatter_id
```

#### `crm_script_library` (Message Templates)
```sql
id UUID PK
title VARCHAR(255)
script_content TEXT
category VARCHAR(100)         -- 'greeting', 'offer', 'follow_up', 'custom'
is_global BOOLEAN             -- true = all users, false = assigned_to_user only
assigned_to_user UUID (FK → profiles.user_id)
created_by UUID
created_at TIMESTAMP WITH TZ
updated_at TIMESTAMP WITH TZ

Indices: is_global, assigned_to_user, category
```

#### `funnel_submissions` (Inbound Lead Capture)
```sql
id UUID PK
source VARCHAR(100)          -- 'contact_form', 'signup', 'webinar'
email VARCHAR(255)
full_name VARCHAR(255)
message TEXT
phone VARCHAR(20)
metadata JSONB
created_at TIMESTAMP WITH TZ
processed_by UUID (FK → profiles.user_id)
status VARCHAR(50)            -- 'new', 'assigned', 'contacted', 'converted'
```

#### `chatter_revenues` (Platform Revenue Tracking)
```sql
id UUID PK
user_id UUID (FK → profiles.user_id)
platform VARCHAR(50)          -- 'onlyfans', 'stripchat'
gross_amount DECIMAL(10, 2)
amount DECIMAL(10, 2)         -- net after splits
provision_rate NUMERIC(5,2)   -- % taken by model
revenue_date DATE
created_at TIMESTAMP WITH TZ
```

#### `shift_assignments` (Schedule & Time Tracking)
```sql
id UUID PK
chatter_id UUID (FK → profiles.user_id)
model_names TEXT[]            -- array of model names assigned
started_at TIMESTAMP WITH TZ
ended_at TIMESTAMP WITH TZ
privateshow_total_hours DECIMAL(8, 2)
privateshow_count INTEGER
notes TEXT
created_at TIMESTAMP WITH TZ
```

#### `profiles` (User Base & Roles)
```sql
user_id UUID PK (FK → auth.users.id)
email VARCHAR(255)
full_name VARCHAR(255)
role VARCHAR(50)              -- 'chatter', 'moderator', 'admin'
provision_rate NUMERIC(5,2)   -- % revenue share (chatters)
hourly_rate DECIMAL(8, 2)     -- EUR/h (moderators)
created_at TIMESTAMP WITH TZ
updated_at TIMESTAMP WITH TZ
```

#### `models` (Model/Creator Registry)
```sql
id UUID PK
name VARCHAR(255)
platform_type VARCHAR(50)     -- 'onlyfans', 'stripchat'
is_active BOOLEAN
created_at TIMESTAMP WITH TZ
updated_at TIMESTAMP WITH TZ

Index: platform_type
```

---

## 3. BROWSERLESS CONNECTION IMPLEMENTATION

### Browserless.io Integration Flow

**Endpoint:** `https://chrome.browserless.io`
**Authentication:** URL query param `?token={BROWSERLESS_API_KEY}`
**API Key Source:** `process.env.BROWSERLESS_API_KEY` (Vercel env var)

#### Step-by-Step Connection

```typescript
// Step 1: Create Browserless Session (HTTP REST API)
POST https://chrome.browserless.io/session?token={apiKey}
Headers: { "Content-Type": "application/json" }
Body: { "ttl": 30 }

Response (200 OK):
{
  "id": "...",
  "connect": "wss://chrome.browserless.io/devtools/browser/...",
  "cloudEndpointId": "...",
  "ttl": 30,
  "stop": "https://...",
  "browserQL": "https://..."
}

// Step 2: Connect Playwright to WebSocket Endpoint
const { chromium } = await import("playwright");
const browser = await chromium.connectOverCDP(
  "wss://chrome.browserless.io/devtools/browser/..."
);

// Step 3: Create Browser Context & Page
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ..."
});
const page = await context.newPage();

// Step 4: Navigate & Wait for Auth
await page.goto("https://onlyfans.com", {
  waitUntil: "networkidle",
  timeout: 60000
});

// Step 5: Monitor for Auth Success
page.on("framenavigated", () => {
  const url = page.url();
  if (url.includes("onlyfans.com/my") || url.includes("onlyfans.com/home")) {
    authSuccessful = true;
  }
});

// Polling loop (2s intervals, 5min max)
while (!authSuccessful && Date.now() - startTime < 300000) {
  await sleep(2000);
  const url = page.url();
  if (url.includes("onlyfans.com/my/")) {
    authSuccessful = true;
    break;
  }
}

// Step 6: Extract Cookies
const cookies = await context.cookies();
// Structure: Array<{name, value, domain, path, expires, httpOnly, secure, sameSite}>

// Step 7: Persist to Supabase
await supabase
  .from("crm_model_sessions")
  .upsert({
    model_id: modelId,
    is_active: true,
    last_verified_at: now(),
    auth_cookies: {
      cookies: [...],
      extractedAt: ISO timestamp,
      source: "browserless"
    }
  }, { onConflict: "model_id" })
  .select()
  .single();

// Step 8: Cleanup
await browser.close();
```

### Architecture Diagram
```
┌─────────────────────┐
│  API Route Handler  │
│  /api/crm/...       │
└──────────┬──────────┘
           │
           ├─→ Validate Admin (RLS check)
           │
           ├─→ Fetch env BROWSERLESS_API_KEY
           │
           └─→ HTTP POST to Browserless REST API
              ├─→ Receive webSocketDebuggerUrl
              │
              └─→ Playwright chromium.connectOverCDP()
                 ├─→ Launch browser session
                 ├─→ Navigate OnlyFans
                 ├─→ Poll for auth success (framenavigated event)
                 ├─→ Extract cookies
                 └─→ Save to crm_model_sessions (Supabase JSONB)
```

### Free Tier Limits
- **Budget:** 100 sessions/month
- **Session Cost:** 1 session = 1 new model connection
- **Persistence:** Cookies stored in DB → models stay "connected" after initial auth
- **Reuse:** Same cookies used for follow-up operations (no new session needed)

---

## 4. USER ROLES & ACCESS CONTROL

### Role Hierarchy

| Role | Access | Restrictions |
|------|--------|---|
| **admin** | All features | Hardcoded UUID + role check in DB |
| **chatter** | Inbox, Dashboard (own data), Content Plan | No management or admin pages |
| **moderator** | Dashboard (hourly rate view), Stripchat stats | No chatroom access |
| **guest/none** | /login only | Redirected from auth gates |

### Access Gate Implementation

#### Admin-Only Routes
```typescript
// /management, /management/crm-connect, /management/crm-vault
const isAdmin =
  user.id === "35498c92-2c4d-4720-a6f7-cc187a4c5fc4" ||
  user.email === "etmanagement@gmail.com" ||
  user.email === "etmanagemant@gmail.com" ||
  profile?.role === "admin";

if (!isAdmin) redirect("/");
```

#### Chatter/Moderator Routes
```typescript
// /crm-inbox
const userRole = profile?.role || "guest";
const isAllowed = ["chatter", "moderator", "admin"].includes(userRole);

if (!isAllowed) redirect("/");
```

#### Role-Specific Dashboard Filtering
```typescript
// /dashboard
if (userRole === "moderator") {
  // Show: Stripchat gross/net, privateshow_hours, privateshow_count
  // Hide: Other platform revenues
  displayModeratorStats();
} else if (userRole === "chatter") {
  // Show: OnlyFans + Stripchat totals, provision breakdown
  displayChatterStats();
} else if (isAdmin) {
  // Show: All revenues (agency-wide, per-user, per-model)
  displayAgencyStats();
}
```

### Management Page Access Levels

#### Weekly Calendar (CreateShiftForm)
- **Admin:** Can assign all models to all chatters
- **Chatter:** Can only view their own shifts (no create)
- **Moderator:** Limited to Stripchat-related shifts

#### Models Management (ModelsManagementClient)
- **Admin Only:** Inline edit names, delete with confirmation modal
- **Other roles:** View-only (no edit/delete buttons)

#### Staff Management Table
- **Admin Only:** Can edit roles, provision %, delete users

### Row-Level Security (RLS) Policies

#### crm_model_sessions
```sql
-- Admin or designated user access
CREATE POLICY "Admin users can access sessions"
ON crm_model_sessions
USING (
  auth.uid() = '35498c92-2c4d-4720-a6f7-cc187a4c5fc4'::uuid
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
```

#### profiles
```sql
-- Users see own profile + admins see all
CREATE POLICY "Users can view own profile"
ON profiles
USING (
  auth.uid() = user_id
  OR (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin'
);
```

---

## 5. DEPLOYMENT & ENVIRONMENT CONFIGURATION

### Vercel Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=https://qzveuqjjhdqcazhfccjp.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
MAIN_APP_INCOMING_SECRET=etmgt_funnel_secret_key_2024_secure
BROWSERLESS_API_KEY=2UtIdqXGNZHMtwG3ef1d46ca35cb0ccf35ead78ee540aa3eb
```

### Build & Runtime
- **Framework:** Next.js 16.2.9 (Turbopack)
- **Runtime:** Node.js 20.x (Vercel Serverless)
- **Browser Engine:** Playwright ^1.61.0 (headless automation only)
- **Database:** Supabase PostgreSQL + RLS
- **Auth:** Supabase Auth (JWT-based)
- **Storage:** Supabase Storage (signed URLs)

### Route Compilation Status
```
✓ Compiled successfully in 5.9s
✓ Finished TypeScript in 6.3s
✓ Collecting page data using 7 workers in 2.3s
✓ Generating static pages using 7 workers (13/13) in 350ms

Routes (13 Dynamic):
├ ƒ /
├ ƒ /login
├ ƒ /dashboard
├ ƒ /management
├ ƒ /management/crm-connect
├ ƒ /management/crm-vault
├ ƒ /crm-inbox
├ ƒ /api/crm/browser-login [POST]
├ ƒ /api/crm/browser-login/status [GET]
├ ƒ /api/crm/revenue-interceptor [POST]
├ ƒ /api/cron-fetch-revenue [GET]
├ ƒ /api/funnel-submissions [POST]
└ ƒ /api/upload-content [POST]
```

---

## 6. CRITICAL PATHS & DATA FLOWS

### OnlyFans Model Connection Flow
```
Admin clicks "🌐 Browser-Login"
  ↓
BrowserLoginStreamComponent opens modal
  ↓
POST /api/crm/browser-login { modelId }
  ├─ Validate admin (RLS + profile role)
  ├─ Fetch BROWSERLESS_API_KEY from env
  ├─ HTTP POST to chrome.browserless.io/session
  ├─ Receive webSocketDebuggerUrl
  ├─ Playwright connectOverCDP(wsEndpoint)
  ├─ Navigate onlyfans.com
  ├─ Poll page.url() for /my/ or /home/ (auth success)
  ├─ Extract context.cookies()
  ├─ Supabase upsert crm_model_sessions with auth_cookies JSONB
  └─ Return { status: "success", modelId, cookieCount }
      ↓
  GET /api/crm/browser-login/status?modelId
    ├─ Query crm_model_sessions WHERE model_id
    └─ Return { authenticated: true/false }
      ↓
  Modal closes, model marked "🔗 Connected"
```

### Chatter CRM Inbox Access Flow
```
Chatter navigates /crm-inbox
  ↓
Server: GET user + check profile.role
  ├─ If role ∉ ['chatter', 'moderator', 'admin'] → redirect /
  └─ Render CRMInboxClient (client component)
      ↓
  Client: 
    ├─ Fetch active fans (RLS filtered by chatter_id)
    ├─ Fetch scripts (RLS: own + global)
    ├─ Real-time listeners on crm_fan_messages
    └─ Render live chat interface
```

### Revenue Sync & Dashboard Flow
```
Daily Cron: /api/cron-fetch-revenue
  ├─ Fetch from external platform API
  ├─ Parse gross + net amounts
  └─ Upsert into chatter_revenues

Admin views /dashboard
  ├─ isAdmin = true → fetch all revenues
  ├─ Calculate: ΣBrutto, ΣNetto, per-user, per-model
  └─ Display agency-wide KPIs

Chatter views /dashboard
  ├─ userRole = "chatter"
  ├─ Filter chatter_revenues WHERE user_id = currentUser.id
  ├─ Calculate provision % from profiles.provision_rate
  └─ Display personal earnings dashboard
```

---

## SUMMARY TABLE

| Component | Implementation | Status |
|-----------|---|---|
| **Browser Automation** | Browserless.io (wss://) + Playwright CDP | ✅ Live |
| **Session Persistence** | crm_model_sessions (JSONB cookies) | ✅ Live |
| **Auth Gates** | Server-side redirect + RLS policies | ✅ Live |
| **Role-Based Views** | Dashboard + Management pages filter by role | ✅ Live |
| **Real-Time Inbox** | Supabase listeners (crm_fan_messages) | ✅ Live |
| **Revenue Tracking** | Daily cron + webhook ingestion | ✅ Live |
| **Admin Controls** | Inline editing + deletion confirmations | ✅ Live |
| **Deployment** | Vercel serverless + Supabase cloud | ✅ Live |
