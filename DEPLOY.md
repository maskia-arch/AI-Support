# eSIM Support Bot — Deploy-Anleitung (VPS / Coolify)

## 1. Voraussetzungen

- **Cloudzy VPS** mit installiertem **Coolify** (selbst gehostet).
- Ein **GitHub-Repository** mit dem Code des eSIM-Beraters.
- Eine lauffähige **PostgreSQL-Instanz** in Coolify (mit `pgvector` Support).

---

## 2. Datenbank-Setup

1. Erstelle eine PostgreSQL-Datenbank in deinem Coolify-Projekt (**Ressource hinzufügen -> Database -> PostgreSQL**).
2. Verbinde dich mit einem SQL-Client (z. B. dem internen DB-Manager von Coolify oder einem externen Tool wie Adminer/DBeaver) mit der Datenbank.
3. Führe den gesamten Inhalt von [supabase/schema_full_v2.sql](file:///c:/Users/Laptop/Desktop/AI%20Support%201.0/supabase/schema_full_v2.sql) aus.
   - Das Script ist idempotent und erstellt alle nötigen Tabellen, Indizes sowie die RAG-Suchfunktion `match_knowledge`.

---

## 3. App-Deployment in Coolify

1. Erstelle eine neue App in Coolify: **Ressource hinzufügen -> Application -> GitHub Repository**.
2. Wähle das Repository deines eSIM-Beraters und den entsprechenden Branch aus.
3. Wähle das **Nixpacks** Build-System aus (wird automatisch als Node.js Projekt erkannt).
4. Setze unter **Environment Variables** (Umgebungsvariablen) die Werte gemäss der [.env.example](file:///c:/Users/Laptop/Desktop/AI%20Support%201.0/.env.example):
   - `DATABASE_URL`: Der Verbindungs-String zu deiner PostgreSQL-Datenbank (wird in Coolify automatisch als Variable angeboten, falls im selben Projekt).
   - `DEEPSEEK_API_KEY`: Dein DeepSeek API-Schlüssel.
   - `TELEGRAM_BOT_TOKEN`: Dein Telegram-Bot-Token.
   - `ADMIN_USERNAME` & `ADMIN_PASSWORD`: Gewünschte Zugangsdaten für das Dashboard.
   - `JWT_SECRET`: Ein sicherer, zufälliger String.
   - `APP_URL`: Die URL der App (wird in Coolify oben bei den Domains konfiguriert).
   - `PORT`: `3000`.
5. Klicke auf **Deploy**.

---

## 4. Erstkonfiguration & Widget-Einbettung

1. Nach erfolgreichem Deployment öffne das Dashboard unter `https://deine-app-domain.com/admin`.
2. Logge dich mit deinen Admin-Zugangsdaten ein.
3. Passe unter **Settings** den System-Prompt an, füge deine Sellauth-Credentials hinzu und starte den Synchronisationsvorgang.
4. Binde das Web-Widget auf deiner Kunden-Website ein, indem du das Script hinzufügst:
   ```html
   <script async src="https://deine-app-domain.com/widget.js"></script>
   ```
