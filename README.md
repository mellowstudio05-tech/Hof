# ChatGPT Webflow Widget - TL Consult

Ein intelligenter Chat-Assistent für TL Consult M&A GmbH, der Besuchern der Website bei Fragen zu Unternehmensnachfolge, M&A-Beratung und Unternehmensverkauf hilft.

## 🎯 Funktionen

- **Intelligente Beratung**: Beantwortet Fragen zu Unternehmensnachfolge und M&A-Themen
- **Aktuelle Inhalte**: Greift automatisch auf die neuesten Website-Inhalte zu
- **Freundliche Kommunikation**: Professionelle und zuvorkommende Gesprächsführung
- **Responsive Design**: Funktioniert auf allen Geräten
- **Web-Scraping**: Automatische Aktualisierung der Inhalte von der TL Consult-Website

## 🚀 Installation

1. **Dependencies installieren:**
   ```bash
   npm install
   ```

2. **Umgebungsvariablen konfigurieren:**
   Erstellen Sie eine `.env` Datei mit:
   ```
   OPENAI_API_KEY=ihr_openai_api_schlüssel
   PORT=3000
   ```

3. **Server starten:**
   ```bash
   npm start
   # oder für Entwicklung:
   npm run dev
   ```

## 📁 Projektstruktur

```
chatgpt-webflow-widget/
├── server.js              # Node.js Backend mit Express
├── chat-widget.html       # Frontend Chat-Widget
├── package.json           # Dependencies und Scripts
├── vercel.json           # Vercel Deployment-Konfiguration
└── README.md             # Diese Datei
```

## 🔧 API-Endpoints

- `POST /api/chat` - Haupt-Chat-Endpoint
- `POST /api/chat-advanced` - Erweiterter Chat mit Konversationshistorie
- `GET /health` - Server-Status
- `POST /api/refresh-content` - Manuelles Aktualisieren der Website-Inhalte
- `GET /api/content` - Aktuelle gescrapte Inhalte anzeigen

## 🎨 Anpassungen

### Farben
Der Assistent verwendet die TL Consult-Farben:
- Primärfarbe: `#1a365d` (Dunkelblau)
- Sekundärfarbe: `#2d3748` (Graublau)

### Inhalte
Der Assistent greift automatisch auf folgende TL Consult-URLs zu:
- Hauptseite und Leistungen
- Unternehmensbörse
- Über uns und Netzwerk
- Neuigkeiten und Podcast
- Kontakt

## 🚀 Deployment

### Vercel
1. Verbinden Sie das Repository mit Vercel
2. Setzen Sie die Umgebungsvariablen in Vercel
3. Deploy automatisch bei Git-Push

### Lokale Entwicklung
```bash
npm run dev
```

## 📱 Verwendung

1. Öffnen Sie `chat-widget.html` in einem Browser
2. Klicken Sie auf den Chat-Button
3. Stellen Sie Ihre Fragen zu Unternehmensnachfolge und M&A-Themen
4. Der Assistent antwortet basierend auf den aktuellen Website-Inhalten

## 🔄 Content-Updates

Die Website-Inhalte werden automatisch alle 24 Stunden aktualisiert. Für sofortige Updates können Sie den `/api/refresh-content` Endpoint aufrufen.

## 🛠️ Technische Details

- **Backend**: Node.js mit Express
- **AI**: OpenAI GPT-3.5-turbo
- **Web-Scraping**: Axios + Cheerio
- **Frontend**: Vanilla JavaScript mit responsive CSS
- **Caching**: 24-Stunden-Cache für optimale Performance

## 📞 Support

Bei Fragen oder Problemen wenden Sie sich an das Entwicklungsteam von TL Consult M&A GmbH.

---

**Entwickelt für TL Consult M&A GmbH**  
*Ihr digitaler Helfer für alle Fragen rund um Unternehmensnachfolge und M&A-Beratung*