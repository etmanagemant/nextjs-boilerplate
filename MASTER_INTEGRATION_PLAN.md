# MASTER INTEGRATION PLAN: OnlyFans Live CRM System

## WEBAPP ECOSYSTEM (Alles muss miteinander sprechen!)

```
┌─────────────────────────────────────────────────────────────┐
│                   ETMANAGEMENT PLATFORM                       │
│  (Admin Portal + Chatter Workspace + Real-time Dashboard)    │
└─────────────────────────────────────────────────────────────┘
          ↓                   ↓                   ↓
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │   OnlyFans   │   │   Schicht    │   │   Umsatz     │
    │   LIVE CRM   │   │   planer     │   │   Dashboard  │
    │              │   │              │   │              │
    │ • Inbox      │   │ • Shifts     │   │ • Revenue    │
    │ • Messages   │   │ • Assign     │   │ • Analytics  │
    │ • Fans       │   │ • Alerts     │   │ • Reports    │
    └──────────────┘   └──────────────┘   └──────────────┘
          ↓                   ↓                   ↓
    ┌──────────────────────────────────────────────────────┐
    │           SHARED DATABASE LAYER                       │
    │  (Supabase: all data synced in real-time via RLS)    │
    └──────────────────────────────────────────────────────┘
          ↓                   ↓                   ↓
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Chatter      │   │ Models/      │   │ Financial    │
    │ Management   │   │ Sessions     │   │ Tracking     │
    │              │   │              │   │              │
    │ • Profiles   │   │ • Connected  │   │ • Payouts    │
    │ • Roles      │   │ • Browsers   │   │ • Earnings   │
    │ • Shifts     │   │ • Active     │   │ • Taxes      │
    └──────────────┘   └──────────────┘   └──────────────┘
```

---

## CURRENT SYSTEMS

### 1. **CRM-Inbox** (`/app/crm-inbox/`)
```
Current: Shows fans + messages from crm_fan_messages table
Problem: Table is EMPTY (messages not syncing)
        
New: Will show LIVE OnlyFans interface
     Messages appear INSTANTLY from Browserless stream
     Features: Notes, Fan CRM, Message Library overlay
```

### 2. **Schichtplan** (`/app/management/`)
```
Current: Assign chatters to shifts + models
Status: ✅ Working
        
Integration: 
- When Chatter A gets assigned "Model 1" shift
- Show notification: "Model 1 shift started - Open CRM?"
- Quick-link to OnlyFans CRM for that model
- Track: Who is chatting with which model right now?
```

### 3. **Dashboard** (`/app/dashboard/`)
```
Current: Shows workspace metrics
Status: Needs data from crm_fan_messages

New integration:
- Live chat count per model
- Active chatters per model  
- Message rate (msgs/hour)
- Revenue per model (from subscribers)
- Fan engagement metrics
- All from crm_fan_messages LIVE!
```

### 4. **Abrechnung/Buchhaltung** (`/app/abrechnung/`, `/app/buchhaltung/`)
```
Current: Financial tracking
Status: ✅ Exists

New integration:
- Auto-calculate from chat metrics:
  * Messages sent → Payout
  * Subscriber count → Bonus
  * Response time → Quality bonus
  * Fan retention → Retention bonus
- Real-time earnings dashboard per chatter
```

### 5. **Management** (`/app/management/`)
```
Current: Model management, CRM setup
Status: ✅ Partially working (connection flow)

New:
- Model streaming status indicator
- Active session management
- Quick-switch between models
- Session timeout warnings
- Manual session restart
```

---

## DATA FLOW: How OnlyFans → Everything

```
┌─────────────────────────────────────┐
│  OnlyFans (via Browserless)          │
│  • Real-time chat messages          │
│  • Subscriber updates               │
│  • Fan metadata                      │
└──────────────┬──────────────────────┘
               │
               ↓
    ┌─────────────────────────┐
    │  Browserless Screenshot │
    │  Stream (200ms polling) │
    └──────────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
    Frontend              Backend
    (Canvas/Overlay)      (API Routes)
         ↓                     ↓
    User clicks      POST /api/crm/interact
    JS Overlay       (click, type, scroll)
         ↓                     ↓
    Sends to          Browserless executes
    Backend           Takes next screenshot
                             ↓
                      ┌─────────────────────┐
                      │  Extract chat data  │
                      │  from screenshot    │
                      │  • Message content  │
                      │  • Sender ID        │
                      │  • Timestamp        │
                      └──────────┬──────────┘
                                 │
                      ┌──────────┴──────────┐
                      │ Save to Database    │
                      │ crm_fan_messages    │
                      │ crm_fan_metadata    │
                      └──────────┬──────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ↓                        ↓                        ↓
    CRM-Inbox          Dashboard               Buchhaltung
    (Overlay UI)       (Metrics)               (Payouts)
    Shows messages     Live stats              Auto-calc
    in real-time       per model               earnings
```

---

## DATABASE SCHEMA: How Everything Connects

```sql
-- Core Models
crm_model_sessions
  id (uuid)
  model_id (text) ← Foreign key to models
  browserless_session_id
  ws_endpoint
  auth_cookies (JSONB)
  is_active (bool)

-- Core Messages (LIVE from Browserless)
crm_fan_messages
  id (uuid)
  model_id ← Links to crm_model_sessions.model_id
  chatter_id ← Links to chatter assignment
  fan_id (text)
  sender (enum: 'model' | 'fan')
  message_text
  created_at (timestamp)

-- Chatter Shifts (Who is working?)
crm_chatter_shifts (NEW - for shift tracking)
  id (uuid)
  chatter_id
  model_id ← Which model this chatter is assigned
  shift_start
  shift_end
  is_active (bool)

-- Fan Metadata (Subscriber info, etc.)
crm_fan_metadata
  id (uuid)
  fan_id
  model_id
  username
  is_subscriber (bool)
  subscriber_since (timestamp)
  total_spent (money)

-- Revenue Tracking (for Buchhaltung)
revenue_tracking (can be auto-generated from above)
  id (uuid)
  chatter_id
  model_id
  period (date)
  messages_sent (int)
  message_earnings (money)
  subscriber_count (int)
  subscriber_bonus (money)
  quality_bonus (money)
  calculated_at (timestamp)
```

---

## API ROUTES TO BUILD

### OnlyFans Live Streaming
- `POST /api/crm/model-open` → Get Browserless session info
- `POST /api/crm/interact` → Send click/type/scroll to Browserless
- `GET /api/crm/screenshot` → Get latest screenshot
- `POST /api/crm/model-close` → Close model stream

### Data Extraction
- `POST /api/crm/extract-messages` → OCR/parse screenshot → save to DB
- `POST /api/crm/extract-fans` → Extract fan list → crm_fan_metadata
- `GET /api/crm/live-stats` → Return live metrics for dashboard

### Chatter Shifts
- `POST /api/shifts/assign` → Assign chatter to model + shift
- `GET /api/shifts/active` → Get active shifts
- `POST /api/shifts/checkin` → Chatter starts shift
- `POST /api/shifts/checkout` → Chatter ends shift

### Revenue Tracking
- `GET /api/revenue/per-chatter` → Earnings data
- `GET /api/revenue/per-model` → Model profitability
- `POST /api/revenue/calculate` → Auto-calc bonuses

---

## FRONTEND COMPONENTS TO BUILD

### OnlyFans Integration
```
components/
  ├── OnlyFansViewer/
  │   ├── Canvas.tsx          (displays Browserless screenshot)
  │   ├── Overlay.tsx         (CRM features on top)
  │   ├── MessageLibrary.tsx  (quick message templates)
  │   ├── FanCRM.tsx          (fan notes, history)
  │   └── Toolbar.tsx         (buttons, settings)
  │
  ├── ModelTabs/
  │   ├── TabBar.tsx          (show open models)
  │   ├── TabContent.tsx      (individual model view)
  │   └── TabManager.tsx      (add/close tabs)
  │
  └── ShiftPlanner/
      ├── ShiftAssign.tsx     (assign chatter to model)
      └── ShiftNotif.tsx      (notify when shift starts)
```

### Dashboard Components
```
components/
  ├── LiveMetrics.tsx         (messages/min, active chats)
  ├── RevenueTracker.tsx      (earnings per chatter/model)
  ├── ChatActivityMap.tsx     (which chatter on which model)
  └── ModelStatusBoard.tsx    (active sessions indicator)
```

---

## REAL-TIME SYNC: WebSocket Strategy

```
Frontend                    Backend                  Database
   ↓                          ↓                          ↓
User clicks                                          
model "TestModel"                                     
   │                                                  
   ├─→ Fetch screenshot ──→ Browserless ──→ Screenshot
   │                                           │
   │                      Parse for           │
   ├─ Display on Canvas   message data ←──────┘
   │     │                      │
   │     ├─ Extract text ───→ crm_fan_messages
   │     │                      │
   │     └─ Update UI       Real-time update
   │                            │
   │  ┌────────────────────────┘
   │  │
   └─→ WebSocket: "new_message"
       ├─→ Dashboard listens
       ├─→ Buchhaltung listens  
       └─→ Shift tracker listens
```

---

## PHASE-BY-PHASE ROLLOUT

### Phase 1: Core OnlyFans Streaming (3-4 days)
- [ ] Screenshot polling from Browserless
- [ ] Canvas rendering
- [ ] Basic overlay (CRM panel)
- [ ] Click/type forwarding
- [ ] Multi-tab UI

### Phase 2: Data Extraction (2 days)
- [ ] OCR/parse screenshots for messages
- [ ] Save to crm_fan_messages
- [ ] Extract fan metadata
- [ ] Real-time sync

### Phase 3: System Integration (2 days)
- [ ] Dashboard live metrics
- [ ] Shift planner integration
- [ ] Revenue auto-calculation
- [ ] WebSocket real-time sync

### Phase 4: Polish (1 day)
- [ ] Error handling
- [ ] Session recovery
- [ ] Performance optimization

**Total: ~8-9 days to full integration**

---

## CRITICAL SUCCESS FACTORS

1. **RLS Policies**: ALL new tables must respect chatter/model permissions
2. **Real-time Updates**: WebSocket for dashboard/metrics
3. **Session Sharing**: 1 Browserless session → N users
4. **Data Accuracy**: OCR must correctly parse chat messages
5. **Latency**: Keep under 300ms for chat experience

---

## NEXT STEP

**START Phase 1 NOW?** ✅

Build the OnlyFans streaming + overlay first, then integrate with existing systems!
