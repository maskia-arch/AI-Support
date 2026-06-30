# Coolify Environment Variable Setup

Um die Anwendung in Coolify erfolgreich zu betreiben, müssen folgende Umgebungsvariablen in den Einstellungen deiner App unter **Environment Variables** eingetragen werden.

## Übersicht der Umgebungsvariablen

| Variable | Beschreibung | Pflicht | Beispiel-Wert |
|---|---|---|---|
| **DATABASE_URL** | PostgreSQL-Verbindungs-URL (mit pgvector) | Ja | `postgresql://postgres:pass@localhost:5432/postgres` |
| **DEEPSEEK_API_KEY** | API-Schlüssel für DeepSeek-Modelle (Haupt-Chat-AI) | Ja | `sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| **TELEGRAM_BOT_TOKEN**| Token deines Telegram Support-Bots | Ja | `1234567890:ABCdefGhIJKlmNoPQRsTUVwxyZ` |
| **ADMIN_USERNAME** | Benutzername für das Admin-Dashboard | Ja | `admin` |
| **ADMIN_PASSWORD** | Passwort für das Admin-Dashboard | Ja | `sicheres_passwort` |
| **JWT_SECRET** | String zur Signierung der Login-Tokens | Ja | `zufaelliger_min_32_zeichen_string` |
| **APP_URL** | Die öffentliche Adresse deiner Anwendung | Ja | `https://esim-support.deinedomain.de` |
| **PORT** | Port auf dem der Node-Server horcht | Ja | `3000` |
| **OPENAI_API_KEY** | API-Schlüssel für OpenAI (RAG Embeddings) | Nein | `sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx` |
| **XAI_API_KEY** | API-Schlüssel für Grok (optional) | Nein | `xai-xxxxxxxxxxxxxxxxxxxxxxxx` |
| **VAPID_PUBLIC_KEY** | Public Key für Push-Benachrichtigungen | Nein | `generate-vapid-keys` |
| **VAPID_PRIVATE_KEY**| Private Key für Push-Benachrichtigungen | Nein | `generate-vapid-keys` |

---

## Einrichtung in Coolify Schritt-für-Schritt

1. Öffne dein Projekt in Coolify und wähle deine **Application** (NodeJS App).
2. Gehe in den Reiter **Environment Variables** (im linken Menü).
3. Klicke auf **Add Variable** (Variable hinzufügen) und trage die Keys und Values einzeln ein.
   - Falls du die PostgreSQL-Datenbank im selben Coolify-Projekt erstellt hast, kannst du die Variable `DATABASE_URL` einfach mit dem Wert `{{DATABASE_URL}}` bzw. dem von Coolify angebotenen Datenbank-Link belegen.
4. Klicke nach dem Speichern aller Variablen auf **Redeploy** (Neu deployen), damit die Variablen für den NodeJS-Container wirksam werden.
