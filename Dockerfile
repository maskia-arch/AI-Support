# Offizielles Node.js-LTS-Image als Basis
FROM node:18-alpine

# Arbeitsverzeichnis im Container erstellen
WORKDIR /usr/src/app

# Abhängigkeiten kopieren (package.json und package-lock.json)
COPY package*.json ./

# Nur Produktions-Abhängigkeiten installieren
RUN npm ci --only=production

# Anwendungs-Code kopieren
COPY . .

# Port der App freigeben (Standardmäßig 3000)
EXPOSE 3000

# Start-Kommando definieren
CMD [ "npm", "start" ]
