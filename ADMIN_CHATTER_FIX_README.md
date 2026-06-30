## 🔧 Admin-Chatter Separation - UPDATE

### Problem 
Wenn ein Admin selbst auch als Chatter arbeitet, werden seine echten Umsätze (z.B. mit sweetjules zusammen verdient) mit "unzugeordneten Tips" vermischt - beide erscheinen in der "Offene Einnahmen & Tips Pool" Sektion.

### Lösung: `assigned_to_chatter` Spalte
Eine neue Spalte `assigned_to_chatter` (BOOLEAN) wurde eingeführt:

| Szenario | Wert | Angezeigt in "Offene Tips" |
|----------|------|---------------------------|
| Admin verdient selbst mit sweetjules | `TRUE` | ❌ Nein, zählt zu seinen Revenues |
| Tip kommt rein, kann keinem Chatter zugeordnet werden | `FALSE` | ✅ Ja, wird als "offener Tip" angezeigt |
| Admin ordnet Tip einem Chatter zu | `TRUE` | ❌ Nein, gehört jetzt dem Chatter |

### Implementierung

**1. SQL Migration (Führe aus):**
```bash
# Kopiere ADMIN_CHATTER_SEPARATION.sql in deine Supabase Console und führe aus
```

**2. Code-Changes (Bereits implementiert):**

✅ **app/dashboard/page.tsx**
- Zeigt nur Revenues mit `assigned_to_chatter = FALSE` als "offene Tips"
- Markiert Revenues als `assigned_to_chatter = TRUE`, wenn zugeordnet

✅ **app/api/cron-fetch-revenue/route.ts**
- Tips zur Admin-ID werden mit `assigned_to_chatter = FALSE` markiert
- Tips zu echten Chattern werden mit `assigned_to_chatter = TRUE` markiert

✅ **components/layout/ModeratorStriptchatShift.tsx**
- Manuell eingegebene Umsätze werden mit `assigned_to_chatter = TRUE` eingegeben

### Workflow Beispiel

**Szenario: Admin "tobias" verdient $20 mit "sweetjules"**

1. SQL ausführen: $20 Revenue hinzufügen mit `user_id = tobias`, `model_id = sweetjules_id`
2. Dashboard lädt den Revenue
3. **assigned_to_chatter = TRUE** → Erscheint in "Tobias' Umsätze", nicht in "Offene Tips"
4. ✅ Problem gelöst!

**Szenario: Ein Tip kommt rein, keinem Chatter zugeordnet**

1. API sendet Tip ohne Chatter-Name
2. Revenue wird zur Admin-ID mit **assigned_to_chatter = FALSE**
3. Dashboard zeigt es in "Offene Tips"
4. Admin klickt "Zuordnen" → Revenue wird zum Chatter verschoben
5. **assigned_to_chatter = TRUE** → Nicht mehr in "Offene Tips"

### Test-Checklist
- [ ] Führe ADMIN_CHATTER_SEPARATION.sql aus
- [ ] Admin gibt manuell Umsatz für sich selbst ein
- [ ] Umsatz erscheint in Admin's Revenues, NICHT in "Offene Tips"
- [ ] Regulärer Tip wird in "Offene Tips" angezeigt
- [ ] Tip kann erfolgreich einem Chatter zugeordnet werden
