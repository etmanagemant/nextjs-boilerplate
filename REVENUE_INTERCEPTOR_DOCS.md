# 💰 CRM REVENUE INTERCEPTOR API

**Endpoint**: `POST /api/crm/revenue-interceptor`

## Purpose
Automated chatter payout dispatcher that:
1. Receives OnlyFans earnings data from sync
2. Maps transaction to responsible chatter via chat logs
3. Prevents double-counting with transaction ID deduplication
4. Calculates platform fees (20% OnlyFans cut)
5. Injects into `chatter_revenues` table for instant dashboard updates

---

## Request Format

### Headers
```
POST /api/crm/revenue-interceptor
Content-Type: application/json
Authorization: Bearer <user_token> (Supabase Auth)
```

### Body (JSON)
```json
{
  "model_id": "uuid-of-creator-profile",
  "fan_id": "uuid-of-subscriber",
  "onlyfans_transaction_id": "OF_TXN_12345",
  "gross_amount": 50.00,
  "type": "tip"
}
```

### Required Fields
| Field | Type | Description |
|-------|------|-------------|
| `model_id` | UUID | Creator's model profile ID |
| `fan_id` | UUID | Fan/subscriber ID |
| `onlyfans_transaction_id` | String | Unique OnlyFans transaction identifier (for deduplication) |
| `gross_amount` | Number | Raw dollar amount from OnlyFans (before fees) |
| `type` | Enum | `"tip"` or `"ppv_unlock"` |

---

## Response Format

### Success (201 Created)
```json
{
  "success": true,
  "revenue": {
    "id": "rev_uuid_123",
    "user_id": "chatter_uuid",
    "model_id": "model_uuid",
    "gross_amount": 50.00,
    "amount": 40.00,
    "platform_fee": "10.00",
    "transaction_id": "OF_TXN_12345",
    "type": "tip",
    "chatter_identified": true
  }
}
```

### Errors

#### 400 Bad Request
```json
{
  "error": "Missing required fields",
  "required": ["model_id", "fan_id", "onlyfans_transaction_id", "gross_amount", "type"]
}
```

#### 401 Unauthorized
```json
{
  "error": "Unauthorized: No authenticated user"
}
```

#### 409 Conflict (Duplicate)
```json
{
  "error": "Transaction already processed",
  "transaction_id": "OF_TXN_12345",
  "status": "duplicate"
}
```

#### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "...",
  "timestamp": "2026-07-15T12:34:56.789Z"
}
```

---

## Processing Logic

### 1️⃣ Chatter Identification
```
Query: crm_chat_logs (model_id + fan_id)
  └─ Find: Most recent chatter_id who interacted with this fan
  └─ Fallback: If no chat log exists → Map to ADMIN account
     (Ensures no revenue is lost)
```

### 2️⃣ Double-Counting Prevention
```
Query: chatter_revenues (transaction_id)
  └─ If exists: Return 409 Conflict (already processed)
  └─ If new: Continue to insertion
```

### 3️⃣ Fee Calculation
```
Net Amount = gross_amount × 0.80
Platform Fee = gross_amount × 0.20 (OnlyFans cut)

Example:
  Gross: $50.00
  Platform Fee: -$10.00 (20%)
  Net to Chatter: $40.00 ✅
```

### 4️⃣ Database Insertion
```sql
INSERT INTO chatter_revenues (
  user_id,
  model_id,
  gross_amount,
  amount,
  platform,
  transaction_id,
  transaction_type,
  fan_id,
  chatter_found,
  created_at
) VALUES (...)
```

---

## Usage Examples

### Example 1: Tip from Fan
```bash
curl -X POST http://localhost:3000/api/crm/revenue-interceptor \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fan_id": "f1e2d3c4-b5a6-7890-1234-abcdef567890",
    "onlyfans_transaction_id": "OF_TIP_20260715_001",
    "gross_amount": 25.00,
    "type": "tip"
  }'
```

### Example 2: PPV Unlock
```bash
curl -X POST http://localhost:3000/api/crm/revenue-interceptor \
  -H "Content-Type: application/json" \
  -d '{
    "model_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "fan_id": "f1e2d3c4-b5a6-7890-1234-abcdef567890",
    "onlyfans_transaction_id": "OF_PPV_20260715_542",
    "gross_amount": 15.00,
    "type": "ppv_unlock"
  }'
```

---

## Architecture Safeguards ✅

- ✅ **No Destructive Operations**: Pure additive insertion, never modifies existing records
- ✅ **Idempotent**: Transaction ID prevents reprocessing if sync runs multiple times
- ✅ **Failsafe Routing**: Unmapped revenue goes to admin account, never lost
- ✅ **Enterprise Error Handling**: Comprehensive try/catch with detailed logging
- ✅ **Audit Trail**: Tracks whether chatter was identified or fallback used
- ✅ **Dynamic Rendering**: `export const dynamic = "force-dynamic"` ensures fresh execution

---

## Database Requirements

### Table: `chatter_revenues`
```sql
-- Must have these columns:
- id (UUID, PK)
- user_id (UUID, FK → auth.users)
- model_id (UUID)
- gross_amount (DECIMAL)
- amount (DECIMAL)
- platform (VARCHAR, e.g., 'onlyf ans')
- transaction_id (VARCHAR, UNIQUE)
- transaction_type (VARCHAR, e.g., 'tip', 'ppv_unlock')
- fan_id (UUID)
- chatter_found (BOOLEAN)
- created_at (TIMESTAMP)
```

### Table: `crm_chat_logs`
```sql
-- Used for chatter lookup:
- model_id (UUID)
- fan_id (UUID)
- chatter_id (UUID)
- created_at (TIMESTAMP)
```

---

## Deployment Checklist

- [ ] Verify `chatter_revenues` table exists with all required columns
- [ ] Verify `crm_chat_logs` table exists with model_id, fan_id, chatter_id
- [ ] Add UNIQUE constraint to `chatter_revenues(transaction_id)` to prevent duplicates
- [ ] Create indices on `chatter_revenues(transaction_id)` for fast lookups
- [ ] Enable RLS on both tables for security
- [ ] Test with sample OnlyFans transaction data
- [ ] Monitor logs in Supabase for any insertion errors
- [ ] Set up webhook/cron to call this endpoint on earnings sync

---

## Logging

All transactions are logged to console with format:
```
[Revenue Interceptor] Processing: TX=OF_TXN_12345, Model=..., Fan=..., Amount=$50
[Revenue Interceptor] Chatter identified from chat log: chatter_uuid
[Revenue Interceptor] ✅ Success: Revenue ID=rev_uuid, Chatter=..., Net=$40
```

Check Vercel logs or local terminal during `npm run dev` for troubleshooting.
