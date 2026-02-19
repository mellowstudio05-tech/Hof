# KI-Suchschlitz für Unternehmensbörse - Integrationsanleitung

## Übersicht
Dieses KI-gestützte Suchfeld erweitert die bestehende [Finsweet CMS Filter](https://finsweet.com/attributes/v1/cms-filter) Lösung um natürliche Sprachverarbeitung. Nutzer können umgangssprachliche Suchanfragen eingeben, die automatisch in konkrete Filterkriterien umgewandelt werden.

## Dateien
- `ki-search-widget.html` - Frontend-Widget
- `server.js` - Backend-API (erweitert)
- Diese Anleitung

## Funktionsweise

### 1. Frontend (ki-search-widget.html)
- **Suchfeld**: Ermöglicht umgangssprachliche Eingaben
- **KI-Verarbeitung**: Sendet Anfragen an Backend-API
- **Finsweet-Integration**: Wendet automatisch Filter an
- **Responsive Design**: Optimiert für alle Geräte

### 2. Backend (server.js)
- **KI-Analyse**: Verwendet OpenAI GPT-3.5-turbo
- **Filter-Mapping**: Wandelt Sprache in Filterkriterien um
- **JSON-Response**: Strukturierte Antwort für Frontend

## Integration in Webflow

### Schritt 1: Finsweet CMS Filter einrichten
1. **Script hinzufügen** in Webflow:
```html
<script src="https://cdn.jsdelivr.net/gh/finsweet/Attributes@latest/cmsfilter.js"></script>
```

2. **Collection List** mit Attribut versehen:
```html
<div fs-cmsfilter-element="list">
    <!-- Ihre Unternehmensbörse Collection List -->
</div>
```

3. **Filter-Form** erstellen:
```html
<form fs-cmsfilter-element="filters">
    <!-- Filter-Elemente -->
</form>
```

### Schritt 2: KI-Suchschlitz einbetten

#### Option A: Als Embed Code
```html
<!-- In Webflow Embed Element einfügen -->
<iframe src="https://ihre-domain.com/ki-search-widget.html" 
        width="100%" 
        height="400" 
        frameborder="0">
</iframe>
```

#### Option B: Direkt in Webflow
1. **HTML Embed** Element hinzufügen
2. **ki-search-widget.html** Inhalt einfügen
3. **CSS** in Webflow Designer anpassen

### Schritt 3: Filter-Felder konfigurieren

#### Beispiel-Filter-Struktur (basierend auf Ihren fs-cmsfilter-field):
```html
<form fs-cmsfilter-element="filters">
    <!-- Branche Filter -->
    <div>
        <label fs-cmsfilter-field="Branche">Maschinenbau</label>
        <input type="checkbox" fs-cmsfilter-field="Branche" value="Maschinenbau">
    </div>
    
    <!-- Region Filter -->
    <div>
        <label fs-cmsfilter-field="Region">Hessen</label>
        <input type="checkbox" fs-cmsfilter-field="Region" value="Hessen">
    </div>
    
    <!-- Status Filter -->
    <div>
        <label fs-cmsfilter-field="Gesucht">Verkauf</label>
        <input type="checkbox" fs-cmsfilter-field="Gesucht" value="Verkauf">
    </div>
    
    <!-- Preis Filter -->
    <div>
        <label fs-cmsfilter-field="Preis">1-5 Mio</label>
        <input type="checkbox" fs-cmsfilter-field="Preis" value="1-5 Mio">
    </div>
</form>
```

## KI-Suchbeispiele

### Eingabe → Filter-Mapping (basierend auf Ihren fs-cmsfilter-field)
```
"Ich suche ein Maschinenbau-Unternehmen"
→ fs-cmsfilter-field="Branche" value="Maschinenbau"

"Unternehmen in Hessen zum Verkauf"
→ fs-cmsfilter-field="Region" value="Hessen"
→ fs-cmsfilter-field="Gesucht" value="Verkauf"

"IT-Firma unter 5 Millionen"
→ fs-cmsfilter-field="Branche" value="IT"
→ fs-cmsfilter-field="Preis" value="unter 5 Mio"

"Gesundheitswesen Unternehmen"
→ fs-cmsfilter-field="Branche" value="Gesundheitswesen"

"Handwerksbetrieb in Bayern"
→ fs-cmsfilter-field="Branche" value="Handwerk"
→ fs-cmsfilter-field="Region" value="Bayern"
```

## Backend-Konfiguration

### Umgebungsvariablen (.env)
```env
OPENAI_API_KEY=your_openai_api_key_here
PORT=3000
```

### API-Endpoints
- `POST /api/ki-search` - KI-Suchverarbeitung
- `GET /api/content` - Aktuelle Website-Inhalte
- `POST /api/refresh-content` - Inhalte aktualisieren

## Anpassungen

### Filterkategorien erweitern
In `server.js` die `searchSystemPrompt` anpassen:

```javascript
VERFÜGBARE FILTERKATEGORIEN:
1. BRANCHE:
   - Maschinenbau, IT/Software, Gesundheitswesen
   - Ihre zusätzlichen Branchen...

2. UNTERNEHMENSGRÖSSE:
   - Ihre Größenkategorien...
```

### Suchvorschläge anpassen
In `ki-search-widget.html`:

```javascript
const exampleQueries = [
    "Ihre spezifischen Suchbeispiele...",
    "Weitere Beispielanfragen..."
];
```

## Deployment

### Vercel (Empfohlen)
1. **Repository** auf GitHub erstellen
2. **Vercel** mit GitHub verbinden
3. **Umgebungsvariablen** setzen
4. **Automatisches Deployment**

### Andere Hosting-Anbieter
- **Netlify**: Drag & Drop Deployment
- **Heroku**: Git-basiertes Deployment
- **AWS/GCP**: Container-basiertes Deployment

## Testing

### Lokale Entwicklung
```bash
npm install
npm start
# Server läuft auf http://localhost:3000
```

### Test-Suchanfragen
1. "Ich suche ein Unternehmen mit 30 Jahren Erfahrung"
2. "Maschinenbau-Unternehmen mit 50+ Mitarbeitern"
3. "IT-Firma mit Umsatz über 5 Millionen"
4. "Familienunternehmen aus der Region Hessen"

## Troubleshooting

### Häufige Probleme

#### 1. Finsweet Filter funktioniert nicht
- **Lösung**: Script-Ladung prüfen, Attribute korrekt setzen

#### 2. KI-Suche gibt keine Ergebnisse
- **Lösung**: OpenAI API-Key prüfen, Backend-Logs checken

#### 3. Filter werden nicht angewendet
- **Lösung**: fs-cmsfilter-field Namen prüfen, Event-Trigger testen

### Debug-Modus
```javascript
// In ki-search-widget.html aktivieren
const DEBUG = true;
if (DEBUG) {
    console.log('KI-Suche Debug-Modus aktiviert');
}
```

## Support

### Dokumentation
- [Finsweet CMS Filter](https://finsweet.com/attributes/v1/cms-filter)
- [OpenAI API](https://platform.openai.com/docs)
- [Webflow Embed](https://university.webflow.com/lesson/embed-custom-code)

### Kontakt
- **E-Mail**: marburg@tl-consult.de
- **Website**: https://www.tl-consult.de

---

**Version**: 1.0  
**Letzte Aktualisierung**: Dezember 2024  
**Kompatibilität**: Webflow CMS, Finsweet Attributes v1
