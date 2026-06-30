# AI eSIM Berater (Standalone - VPS/Coolify)

Customer-Support-Bot mit Web-Widget und eigenem Admin-Dashboard, lauffähig auf dem eigenen VPS via Coolify.

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
Coolify VPS-Service (NodeJS) ──── Lokale PostgreSQL-Datenbank (mit pgvector)
       │
       ├── Telegram-Support-Bot (TELEGRAM_BOT_TOKEN)
       └── /widget.js → Kunden-Website
```

## Erstmal-Setup

### 1. PostgreSQL-Datenbank in Coolify anlegen

1. Erstelle in Coolify ein neues Service-Projekt oder füge eine neue Ressource hinzu: **Database -> PostgreSQL**.
2. **WICHTIG:** Nutze ein PostgreSQL-Image, das pgvector unterstützt (z. B. `ankane/pgvector`).
3. Kopiere nach dem Start die interne oder externe Verbindungs-URL (Connection String). Sie hat das Format:
   `postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/[DB_NAME]`
4. Verbinde dich mit einem DB-Tool deiner Wahl (z. B. Adminer, pgAdmin) und führe das Script `supabase/schema_full_v2.sql` aus, um die Tabellenstruktur aufzusetzen.

### 2. Node.js App in Coolify bereitstellen

1. Erstelle eine neue Ressource in Coolify: **Application -> Github Repository**.
2. Nutze das NodeJS Nixpack (wird von Coolify automatisch erkannt).
3. Setze folgende Umgebungsvariablen in den App-Einstellungen unter **Environment Variables**:

```
DATABASE_URL=<PostgreSQL-Verbindungs-URL>
DEEPSEEK_API_KEY=<DeepSeek-API-Key>
OPENAI_API_KEY=<OpenAI-Key fuer Embeddings>
TELEGRAM_BOT_TOKEN=<Support-Bot-Token>
ADMIN_USERNAME=<Dashboard-Login>
ADMIN_PASSWORD=<Dashboard-Passwort>
JWT_SECRET=<32-Zeichen-Zufallswert>
VAPID_PUBLIC_KEY=<Web-Push Public-Key>
VAPID_PRIVATE_KEY=<Web-Push Private-Key>
APP_URL=https://dein-berater.domain.de
PORT=3000
```

4. Klicke auf **Deploy**. Coolify installiert die Abhängigkeiten und startet die App automatisch.

### 3. Erstkonfiguration

1. Dashboard oeffnen: `https://dein-berater.domain.de/admin`
2. Einloggen
3. Settings → System-Prompt anpassen
4. Settings → Sellauth → API-Key + Shop-ID eintragen → Sellauth-Sync starten
5. Knowledge-Base aufbauen: Manuelle Eintraege oder Scraper

### 4. Widget auf Website einbauen

Im `<head>` oder vor `</body>` der Kunden-Website:
```html
<script async src="https://dein-berater.domain.de/widget.js"></script>
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
https://dein-berater.domain.de/api/widget/health
```
