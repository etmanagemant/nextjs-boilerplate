# OnlyFans Live Integration Architecture

## HIGH-LEVEL FLOW

```
User clicks Model in Sidebar
    ↓
Frontend: POST /api/crm/model-stream/start { modelId }
    ↓
Backend: Returns Browserless session ID + stream URL
    ↓
Frontend: Opens Iframe with screenshot stream
    ↓
JavaScript: Captures user interactions (click, type)
    ↓
Frontend: POST /api/crm/model-stream/interact { action, coords }
    ↓
Backend: Forwards to Browserless via WebSocket
    ↓
Browserless: Executes action, takes screenshot
    ↓
Screenshot sent back to Frontend
    ↓
Iframe updates with new screenshot
```

## API ROUTES NEEDED

### 1. Start Stream
**POST** `/api/crm/model-stream/start`
- Input: `{ modelId: string }`
- Output: `{ sessionId, streamId, wsEndpoint }`
- Action: Get Browserless session, initialize stream

### 2. Send Interaction
**POST** `/api/crm/model-stream/interact`
- Input: `{ streamId, action, data }`
- Action types: `click`, `type`, `scroll`, `hover`
- Output: `{ success, screenshot }`
- Action: Send keyboard/mouse event to Browserless

### 3. Get Screenshot
**GET** `/api/crm/model-stream/screenshot?streamId=xxx`
- Output: PNG image/base64
- Action: Get latest screenshot from Browserless

### 4. Close Stream
**POST** `/api/crm/model-stream/close`
- Input: `{ streamId }`
- Action: Cleanup session

## DATABASE CHANGES NEEDED

**No major schema changes** - reuse `crm_model_sessions`:
- `browserless_session_id` ✅ already stored
- `ws_endpoint` ✅ already stored
- Add: `stream_active_count` (tracks how many streams are open)

## FRONTEND COMPONENTS

### 1. ModelStreamViewer (NEW)
```tsx
<ModelStreamViewer 
  modelId={modelId}
  onInteraction={handleInteraction}
/>
```
- Uses Iframe + Canvas
- Displays OnlyFans stream
- Captures clicks/typing
- Forwards to /interact endpoint

### 2. Sidebar Update
```tsx
onClick: () => openModelStream(modelId)
onContextMenu: () => window.open(`https://onlyfans.com/...`)
```

### 3. Multi-Tab Management
```tsx
// Store active streams in sessionStorage
const activeStreams = {
  'model-1': { sessionId, streamId },
  'model-2': { sessionId, streamId }
}
```

## IMPLEMENTATION PHASES

### Phase 1: Backend API Routes (2-3 hours)
- [ ] /api/crm/model-stream/start
- [ ] /api/crm/model-stream/interact
- [ ] /api/crm/model-stream/screenshot
- [ ] /api/crm/model-stream/close
- [ ] Browserless interaction handler (click, type, scroll)

### Phase 2: Frontend Components (3-4 hours)
- [ ] ModelStreamViewer component
- [ ] Canvas/Iframe setup
- [ ] Event listener setup
- [ ] Screenshot polling

### Phase 3: Integration (2-3 hours)
- [ ] Sidebar model click handler
- [ ] Multi-tab support
- [ ] Session storage
- [ ] Cleanup handlers

### Phase 4: Testing & Polish (1-2 hours)
- [ ] Test all interactions
- [ ] Performance optimization
- [ ] Error handling

## KEY CHALLENGES

1. **Screenshot Streaming**
   - Need fast screenshot polling
   - Canvas rendering performance
   - Compression/encoding

2. **Interaction Forwarding**
   - Coordinate system matching
   - Event timing
   - Lag compensation

3. **Multi-Tab Session Management**
   - Keep sessions alive
   - Prevent cookie conflicts
   - Cleanup on close

4. **Real-time Performance**
   - Browserless response time
   - Network latency
   - Screenshot generation time
   - Target: <500ms interaction latency

## ESTIMATED TOTAL TIME
**Total: 8-12 hours** (can be done in 1-2 days)

## NEXT STEP
Confirm this architecture, then start Phase 1!
