# eSIM Support Bot — Deploy-Anleitung (VPS / Coolify)

## 1. Voraussetzungen & Speicher-Modi (Dual-Datenbank-Support)

Die Anwendung unterstützt jetzt zwei verschiedene Speicher-Betriebsarten:

### Methode A: Lokale SQLite-Datenbank (Empfohlen 🌟)
- **Vorteil:** Benötigt **keine** externen Datenbank-Instanzen und **keine** aufwendige Konfiguration. Die Vektorsuche (RAG) wird direkt in JavaScript berechnet.
- **Einrichtung:** Du musst in Coolify lediglich ein **Volume (Speicher-Volume)** hinzufügen, damit deine Daten Neustarts überleben.
- **Konfiguration:** Lass die Variable `DATABASE_URL` einfach leer bzw. trage sie gar nicht ein. Die App schwenkt automatisch auf SQLite um.

### Methode B: Externe PostgreSQL-Datenbank
- **Vorteil:** Skalierbarkeit.
- **Einrichtung:** Du musst in Coolify einen PostgreSQL-Service hinzufügen (mit `pgvector` support, z. B. Image `ankane/pgvector`) und das Schema via `supabase/schema_full_v2.sql` einspielen.
- **Konfiguration:** Setze die Umgebungsvariable `DATABASE_URL` auf deinen PostgreSQL-Connection-String.

---

## 2. Einrichtung unter Coolify (Schritt-für-Schritt mit SQLite)

1. **Ressource hinzufügen:** Erstelle eine neue Application in Coolify: **Application -> GitHub Repository**.
2. **Repository & Branch:** Wähle dein Repository (`maskia-arch/AI-Support`) und den Branch `main`.
3. **Build-System:** Coolify nutzt automatisch die im Hauptverzeichnis liegende `Dockerfile` (Basiert auf Node 20).
4. **Volume hinzufügen (WICHTIG für Daten-Persistenz):**
   - Gehe in deiner Coolify-Anwendung auf den Reiter **Storages** (Speicher).
   - Füge ein neues Volume hinzu:
     - **Destination Path (Zielpfad):** `/usr/src/app/data`
     - **Name:** z. B. `esim-bot-data`
   - Dadurch wird die SQLite-Datenbank (`sqlite.db`) außerhalb des Containers auf deinem VPS gespeichert und überlebt Updates und Restarts der App.

5. **Umgebungsvariablen eintragen:**
   Gehe in deiner Coolify-Anwendung auf **Environment Variables** und trage folgende Werte ein (gemäss der [.env.example](file:///c:/Users/Laptop/Desktop/AI%20Support%201.0/.env.example)):
   - `DEEPSEEK_API_KEY`: Dein DeepSeek API-Schlüssel.
   - `TELEGRAM_BOT_TOKEN`: Dein Telegram-Bot-Token.
   - `ADMIN_USERNAME` & `ADMIN_PASSWORD`: Gewünschte Zugangsdaten für das Dashboard.
   - `JWT_SECRET`: Ein sicherer, zufälliger String.
   - `APP_URL`: Die URL der App (z. B. `https://esim-bot.deindomain.de`).
   - `PORT`: `3000`.
   - *(Hinweis: `DATABASE_URL` kann weggelassen werden, um SQLite zu nutzen!)*

6. **Deployen:** Klicke oben rechts auf **Deploy**. Die App baut den NodeJS-Container, initialisiert die SQLite-Datenbank im persistenten Volume automatisch beim ersten Start und läuft los!

---

## 3. Erstkonfiguration & Widget-Einbettung

1. Nach erfolgreichem Deployment öffne das Dashboard unter `https://deine-app-domain.com/admin`.
2. Logge dich mit deinen Admin-Zugangsdaten ein.
3. Passe unter **Settings** den System-Prompt an, füge deine Sellauth-Credentials hinzu und starte den Synchronisationsvorgang.
4. Binde das Web-Widget auf deiner Kunden-Website ein, indem du das Script hinzufügst:
   ```html
   <script async src="https://deine-app-domain.com/widget.js"></script>
   ```
