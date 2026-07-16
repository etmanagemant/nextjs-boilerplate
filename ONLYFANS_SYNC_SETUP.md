# OnlyFans Auto-Sync Setup

## 🎯 What This Does

When a user connects their OnlyFans account via Browser-Login:
1. **User clicks "Ich bin eingeloggt!"** → Cookies get stored ✅
2. **Confirm endpoint triggers auto-sync** → OnlyFans inbox fetched 🔄
3. **All fans & messages stored in DB** → CRM shows real chats 📊
4. **Cron-job keeps syncing** → Live updates every 1-2 minutes ⚡

## 🚀 Setup Steps

### Step 1: Database Migration
Run this in **Supabase SQL Editor**:
```sql
-- Copy entire contents of ONLYFANS_SYNC_MIGRATION.sql
```

What it does:
- Adds `last_synced_at` to `crm_model_sessions`
- Adds `external_message_id` & `metadata` to `crm_fan_messages`
- Creates indexes for faster queries

### Step 2: Environment Variables
Add to `.env.local`:
```
NEXT_PUBLIC_APP_URL=https://yourapp.vercel.app
CRON_SECRET=your-secret-key-here-make-it-strong
```

### Step 3: Configure Cron-Job in Vercel
1. Go to **Vercel Dashboard** → Your Project → **Settings**
2. Click **Cron Jobs**
3. Add new cron job:
   - **Endpoint**: `/api/cron/sync-chats`
   - **Schedule**: `*/1 * * * *` (every 1 minute)
   - **Query Parameter**: `secret=your-secret-key-here`

**Alternative**: Use external service like EasyCron:
- URL: `https://yourapp.vercel.app/api/cron/sync-chats?secret=your-secret-key`
- Frequency: Every 1-2 minutes

### Step 4: Test Everything

**Test 1: Browser Login**
```
1. Go to /crm-connect
2. Click "Browser-Login" on a model
3. OnlyFans login opens
4. Click "Ich bin eingeloggt!"
```

**Test 2: Check Sync Triggered**
Look for logs:
```
[CONFIRM-LOGIN] ✅ Login confirmed, is_active = true
[CONFIRM-LOGIN] 🔄 Triggering OnlyFans sync...
[SYNC] ✅ Synced testmodel: 5 fans, 12 messages
```

**Test 3: Check CRM Shows Data**
```
1. Go to /crm-inbox
2. Select your model
3. Should see fans in the list
4. Click a fan to see messages
```

**Test 4: Manual Sync Test**
```bash
curl -X POST http://localhost:3000/api/crm/sync-onlyfans-chats \
  -H "Content-Type: application/json" \
  -d '{"modelId": "testmodel", "sessionId": "your-session-id"}'
```

**Test 5: Cron-Job Test**
```bash
curl "https://yourapp.vercel.app/api/cron/sync-chats?secret=your-secret-key"
```

## 🔄 How It Works

### Auto-Sync After Login
```
User confirms login
    ↓
/confirm endpoint called
    ↓
Session marked is_active = true
    ↓
/api/crm/sync-onlyfans-chats triggered (background)
    ↓
Browserless opens OnlyFans with stored cookies
    ↓
Fetches all fans & messages from /api2/v2/inbox
    ↓
Stores in DB (crm_fan_metadata, crm_fan_messages)
    ↓
CRM Inbox shows data
```

### Live Updates via Cron-Job
```
Every 1 minute (Cron-Job runs)
    ↓
Fetch all active sessions (is_active = true)
    ↓
For each session:
    - Sync OnlyFans inbox
    - Fetch new messages
    - Store in DB
    ↓
CRM updates in real-time
```

## 📊 Database Schema

### crm_model_sessions
```sql
- id: UUID (primary key)
- model_id: TEXT
- is_active: BOOLEAN
- auth_cookies: JSONB (OnlyFans cookies)
- last_synced_at: TIMESTAMP (NEW)
- created_at: TIMESTAMP
```

### crm_fan_messages
```sql
- id: UUID (primary key)
- fan_id: TEXT
- chatter_id: TEXT
- content: TEXT
- is_from_fan: BOOLEAN
- is_read: BOOLEAN
- external_message_id: TEXT (NEW - for deduplication)
- metadata: JSONB (NEW - media type, price, etc.)
- created_at: TIMESTAMP
```

### crm_fan_metadata
```sql
- fan_id: TEXT
- model_id: TEXT
- username: TEXT
- lifetime_value: NUMERIC
- last_verified_at: TIMESTAMP (NEW)
```

## 🐛 Troubleshooting

### Sync not triggering after login
- Check logs for `[CONFIRM-LOGIN]` messages
- Verify `auth_cookies` are stored in DB
- Check Browserless API key is set

### Cron-job not running
- Check Vercel Cron Jobs settings
- Verify `CRON_SECRET` matches
- Test manually with curl

### No fans showing in CRM
- Check `crm_fan_metadata` has model_id set
- Run `/api/cron/sync-chats` manually
- Check `crm_fan_messages` for data

### Messages not updating
- Check `last_synced_at` in `crm_model_sessions`
- Verify `external_message_id` prevents duplicates
- Check logs for sync errors

## 📋 API Endpoints

### POST `/api/crm/sync-onlyfans-chats`
Manually sync a specific model's OnlyFans data

**Body:**
```json
{
  "modelId": "testmodel",
  "sessionId": "session-uuid"
}
```

**Response:**
```json
{
  "status": "success",
  "fansCount": 5,
  "messagesCount": 12,
  "timestamp": "2026-07-16T10:30:00Z"
}
```

### GET `/api/cron/sync-chats?secret=YOUR_SECRET`
Cron-job endpoint - syncs all active models

**Response:**
```json
{
  "status": "success",
  "syncedCount": 2,
  "results": [
    {
      "modelId": "testmodel",
      "status": "success",
      "fansCount": 5,
      "messagesCount": 12
    }
  ]
}
```

## ⚡ Performance Notes

- **Sync duration**: ~10-30 seconds per model (depends on data size)
- **Cron frequency**: Every 1 minute (recommended)
- **Browserless timeout**: 30 seconds
- **Message deduplication**: Checked via `external_message_id`

## 🔐 Security Notes

- Auth cookies stored encrypted in Supabase (use RLS!)
- Cron-job protected with `CRON_SECRET`
- Browserless API key protected via env var
- Only admin/model owner can access their data

## 📚 Next Steps

1. ✅ Run migration
2. ✅ Set environment variables
3. ✅ Configure Cron-Job in Vercel
4. ✅ Test login + sync
5. ✅ Monitor logs for errors
6. 🔄 Live-test with real OnlyFans account
