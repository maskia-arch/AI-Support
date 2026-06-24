# AI eSIM Berater (Standalone)

Customer-Support-Bot mit Web-Widget und eigenem Admin-Dashboard.

## Was kann das?

- **Web-Widget**: Einbettbares Chat-Widget fuer deine Website
- **Telegram-Support-Bot**: Kunden koennen auch via Telegram chatten
- **Knowledge-Base mit RAG**: Wissensbasis durchsucht per Embedding-Vektor
- **Lernen-Workflow**: Unbeantwortete Fragen landen in einer Queue
- **Sellauth-Integration**: Bestellungen + Produkt-Lookup
- **Daily Coupons**: Aktionscodes nach Wochenplan
- **Visitor-Tracking**: Besucher-Sessions, Page-Views, Bans

## Architektur

```
Berater-Render-Service ──── NEUE Supabase-DB
       │
       ├── Telegram-Support-Bot (TELEGRAM_BOT_TOKEN)
       └── /widget.js → Kunden-Website
```

## Erstmal-Setup

### 1. Neue Supabase-Datenbank

1. Bei [supabase.com](https://supabase.com) neues Projekt erstellen
2. SQL-Editor oeffnen
3. Das Script `supabase/INSTALL_berater_v1_6_78.sql` ausfuehren

### 2. Render-Deploy

ENV-Variablen:

```
SUPABASE_URL=<URL der NEUEN Berater-Datenbank>
SUPABASE_SERVICE_ROLE_KEY=<Service-Role-Key der NEUEN DB>
DEEPSEEK_API_KEY=<DeepSeek-API-Key>
OPENAI_API_KEY=<OpenAI-Key fuer Embeddings>
TELEGRAM_BOT_TOKEN=<Support-Bot-Token>
ADMIN_USERNAME=<Dashboard-Login>
ADMIN_PASSWORD=<Dashboard-Passwort>
JWT_SECRET=<32-Zeichen-Zufallswert>
VAPID_PUBLIC_KEY=<Web-Push Public-Key>
VAPID_PRIVATE_KEY=<Web-Push Private-Key>
APP_URL=https://dein-berater.onrender.com
PORT=3000
```

Build-Command:
```
npm install
```

Start-Command:
```
node src/server.js
```

### 3. Erstkonfiguration

1. Dashboard oeffnen: `https://dein-berater.onrender.com/admin`
2. Einloggen
3. Settings → System-Prompt anpassen
4. Settings → Sellauth → API-Key + Shop-ID eintragen → Sellauth-Sync starten
5. Knowledge-Base aufbauen: Manuelle Eintraege oder Scraper

### 4. Widget auf Website einbauen

Im `<head>` oder vor `</body>` der Kunden-Website:
```html
<script async src="https://dein-berater.onrender.com/widget.js"></script>
```

## Endpunkte

```
POST /api/webhooks/telegram       Bot-Webhook (Telegram)
POST /api/widget/init             Widget-Session-Start
POST /api/widget/message          Widget-Nachricht
GET  /api/widget/config           Widget-Konfig
GET  /api/widget/health           Widget-Health-Check
POST /api/admin/login             Dashboard-Login
GET  /api/admin/chats             Chat-Liste
GET  /api/admin/knowledge/entries Knowledge-Liste
GET  /widget.js                   Widget-Embed-Script
GET  /admin                       Dashboard-UI
GET  /health                      Liveness-Check
```

## Diagnose

Bei Widget-Problemen Browser-Console oeffnen:
```js
window.__VS25_LOADED       // sollte true sein
window.__VS25_VERSION      // sollte "1.6.78" sein
```

Plus den Health-Endpoint anpingen:
```
https://dein-berater.onrender.com/api/widget/health
```
