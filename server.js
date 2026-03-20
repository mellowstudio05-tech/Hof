const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://hof.mellow.studio',
        'https://www.hof.mellow.studio',
        'https://behring-gutshof.de',
        'https://www.behring-gutshof.de',
        'https://www.gutshof-gin.de',
        'https://gutshof-gin.de',
        'https://hof-theta-beryl.vercel.app',
        // Nur für lokale Entwicklung - in Produktion entfernen!
        ...(process.env.NODE_ENV !== 'production' ? ['http://localhost:3000'] : [])
    ],
    credentials: true
}));
app.use(express.json());

// OpenAI Konfiguration
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Calendly – für Terminbuchung (Vercel: optional CALENDLY_URL überschreiben; Standard: Gutshof 30min)
const CALENDLY_URL = (process.env.CALENDLY_URL || 'https://calendly.com/stefanvanthoogt/30min').trim();
// Calendly API – für Abruf freier Termine (Personal Access Token unter https://calendly.com/integrations/api_webhooks)
const CALENDLY_API_TOKEN = (process.env.CALENDLY_API_TOKEN || '').trim();
const CALENDLY_API_BASE = 'https://api.calendly.com';

// Cache für Calendly-Verfügbarkeit (5 Min)
let calendlyAvailableTimesCache = null;
let calendlyCacheTime = 0;
const CALENDLY_CACHE_MS = 5 * 60 * 1000;

/** Ruft freie Termine von Calendly für die nächsten 7 Tage ab. Gibt lesbare Zeilen für den Prompt zurück oder []. */
async function getCalendlyAvailableTimes() {
    if (!CALENDLY_API_TOKEN) return [];
    const now = Date.now();
    if (calendlyAvailableTimesCache && (now - calendlyCacheTime) < CALENDLY_CACHE_MS)
        return calendlyAvailableTimesCache;

    const auth = { headers: { Authorization: `Bearer ${CALENDLY_API_TOKEN}` } };

    try {
        // 1) Aktuellen User holen
        const userRes = await axios.get(`${CALENDLY_API_BASE}/users/me`, auth);
        const userUri = userRes.data?.resource?.uri;
        if (!userUri) return [];

        // 2) Event Types holen (z. B. 30min)
        const etRes = await axios.get(`${CALENDLY_API_BASE}/event_types`, {
            ...auth,
            params: { user: userUri }
        });
        const eventTypes = etRes.data?.collection || [];
        const eventType = eventTypes.find(et => (et.slug || '').includes('30min')) || eventTypes[0];
        const eventTypeUri = eventType?.uri;
        if (!eventTypeUri) return [];

        // 3) Start/Ende: ab nächster Viertelstunde + 7 Tage (API verlangt „in der Zukunft“)
        const start = new Date();
        const ms15 = 15 * 60 * 1000;
        start.setTime(Math.ceil(start.getTime() / ms15) * ms15);
        const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
        const startTime = start.toISOString();
        const endTime = end.toISOString();

        const timesRes = await axios.get(`${CALENDLY_API_BASE}/event_type_available_times`, {
            ...auth,
            params: { event_type: eventTypeUri, start_time: startTime, end_time: endTime }
        });
        const slots = timesRes.data?.collection || [];
        // Nur Donnerstage in Europe/Berlin – Vorgespräche finden nur donnerstags statt
        // Zeiten in Europe/Berlin formatieren, damit sie mit dem Calendly-Widget übereinstimmen
        const tz = 'Europe/Berlin';
        const thursdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
        const lines = slots
            .map(s => {
                const t = s.start_time ? new Date(s.start_time) : null;
                if (!t) return null;
                if (thursdayFormatter.format(t) !== 'Thu') return null; // nur Donnerstag (in Berlin)
                return t.toLocaleString('de-DE', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            })
            .filter(Boolean)
            .slice(0, 30);

        calendlyAvailableTimesCache = lines;
        calendlyCacheTime = now;
        return lines;
    } catch (err) {
        console.error('Calendly API Fehler:', err.response?.status, err.message);
        return [];
    }
}

// Quellen für die Gutshof-KI (Alter Behring Gutshof & Gutshof Gin)
const GUTSHOF_URLS = [
    'https://hof.mellow.studio/',
    'https://hof.mellow.studio/kontakt',
    'https://hof.mellow.studio/foodbuudy',
    'https://www.gutshof-gin.de/',
    'https://www.gutshof-gin.de/collections/gin'
];

// Web-Scraping Funktion für Gutshof-Seiten
async function scrapeGutshofContent() {
    const content = [];
    
    for (const url of GUTSHOF_URLS) {
        try {
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            const $ = cheerio.load(response.data);
            $('script, style, nav, footer').remove();
            
            const pageContent = {
                url: url,
                title: $('title').text().trim(),
                content: $('body').text().replace(/\s+/g, ' ').trim()
            };
            
            content.push(pageContent);
            console.log(`Content scraped from: ${url}`);
            
        } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
        }
    }
    
    return content;
}

// Cache für gescrapte Inhalte
let scrapedContent = null;
let lastScrapeTime = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 Stunden

// Funktion zum Abrufen der aktuellen Inhalte
async function getCurrentContent() {
    const now = Date.now();
    
    if (!scrapedContent || (now - lastScrapeTime) > CACHE_DURATION) {
        console.log('Scraping fresh content...');
        scrapedContent = await scrapeGutshofContent();
        lastScrapeTime = now;
    }
    
    return scrapedContent;
}

// System-Prompt für Emil – Gutshof-KI (Alter Behring Gutshof)
const SYSTEM_PROMPT = `Du bist Emil, der höfliche und hilfsbereite KI-Assistent des Alten Behring Gutshofs. Du sprichst immer in der Sie-Form und bist zuvorkommend, freundlich und serviceorientiert. Dein Wissen bezieht sich auf den Alten Behring Gutshof (Eventlocation in Marburg-Marbach), den FOODbuddy (Foodtruck/Catering) und Gutshof Gin.

DEINE QUELLEN (nutze diese URLs in Antworten):
- Hauptseite Gutshof: https://hof.mellow.studio/
- Kontakt: https://hof.mellow.studio/kontakt
- FOODbuddy: https://hof.mellow.studio/foodbuudy
- Gutshof Gin: https://www.gutshof-gin.de/
- Gin-Shop: https://www.gutshof-gin.de/collections/gin

ALTER BEHRING GUTSHOF – KERNINFOS:
- Den Alten Behring Gutshof gibt es seit 2004.
- Eventlocation im Herzen von Marburg-Marbach (Hessen), mit Charakter und Geschichte
- Veranstaltungen: Hochzeiten, Tagungen, Weihnachtsfeiern, Firmenfeiern, private Feiern
- Kapazität: Innen 15–120 Personen (je nach Raum); Außen bis ca. 300 Personen (Sommer)
- Räume: Gewölbekeller (bis 20), Pferdestall (bis 100), Markthalle, Behring-Kabinett, Saal (bis 80), Bar, Küche, Innenhof
- Familienbetrieb: Stefan (Begleitung & Wünsche), Soraya (Küche & Organisation), Xhemal (Ablauf vor Ort), Oma Rosi (Desserts)
- Barrierefreiheit: Mehrere Bereiche ebenerdig; historisches Anwesen, nicht alle Räume voll barrierefrei – persönliche Beratung zur Raumwahl
- Bis 200 Personen möglich: Pferdestall + Markthalle + Außenbereich exklusiv
- Vegetarisch/vegan: Ja, auch rein vegetarische/vegane Feiern möglich
- Weihnachtsfeiern & Tagungen: Ja, Formular auf Kontaktseite nutzen

HISTORIE (inhaltliche Quelle):
Der Behring-Gutshof gehörte zum Besitz von Emil von Behring (1854–1917), dem ersten Nobelpreisträger für Medizin. Der Gutshof diente als landwirtschaftlicher Wirtschaftsstandort und war Teil des Umfelds, in dem von Behring lebte und arbeitete.
Emil von Behring entwickelte die Serumtherapie gegen Diphtherie und Tetanus, eine bahnbrechende medizinische Entdeckung, die weltweit unzählige Menschenleben rettete. Der Gutshof steht damit sinnbildlich für eine Zeit, in der von Marburg aus medizinische Geschichte geschrieben wurde.
Bei Fragen zur Geschichte, zu Emil von Behring oder zur Bedeutung des Ortes diese Informationen einbeziehen.

KONTAKT ALTER BEHRING GUTSHOF:
- Adresse: Alter Behring-Gutshof, Brunnenstr. 16, 35041 Marburg
- Telefon: 0151 / 12726010
- E-Mail: info@behring-gutshof.de
- Anfrage: Formular auf https://hof.mellow.studio/kontakt (Hochzeit, Taufe, Konfirmation, Geburtstag, Firmenfeier, Sonstiges)

FOODBUDDY (Foodtruck/Catering):
- Einsätze auch außerhalb des Hofs: Firmenfeier, Messe, privates Event
- Mietbar immer inkl. Team – Bewirtung durch das Gutshof-Team
- Anfrage: https://hof.mellow.studio/foodbuudy

VERLINKUNG – PFLICHT (immer so umsetzen):
- Kontaktanfrage, Hochzeit, Taufe, Konfirmation, Geburtstag, Firmenfeier, allgemeine Anfrage (ohne reine Terminbuchung), „kontaktieren“, „anfragen“, „melden“ → auf das Kontaktformular verlinken: https://hof.mellow.studio/kontakt
- FOODbuddy, Foodtruck, Catering außerhalb, Miete Foodtruck → IMMER auf https://hof.mellow.studio/foodbuudy verlinken
- Vorgespräch, Termin buchen, Besichtigung, „wann habt ihr Zeit“, „freie Termine“, „wann vorbeikommen“ → NIEMALS das Kontaktformular empfehlen. IMMER den Calendly-Buchungslink anbieten (siehe TERMINBUCHUNG). Wenn VERFÜGBARE TERMINE unten aufgeführt sind, diese konkreten Zeiten in der Antwort nennen.

VORGESPRÄCHE:
- Vorgespräche finden immer nur donnerstags statt. Emil soll das bei Termin-Anfragen erwähnen.
- Bei angezeigten freien Terminen immer darauf hinweisen: Die genannten Zeiten sind zum Abrufzeitpunkt frei; sie können inzwischen bereits vergeben sein. Bitte über den Buchungslink prüfen bzw. direkt buchen.

GUTSHOF GIN:
- London Dry Gin aus Marburg, regional gebrannt
- Brüder Grimm Edition: Cinnabella, Limetta, Rosata, Mandarina, Bläuling, Klassik u. a.
- Shop online: https://www.gutshof-gin.de/collections/gin
- Gutshof-Shop vor Ort: Brunnenstraße 16, Marburg – Fr 14–19 Uhr, Sa 12–18 Uhr (oder nach Vereinbarung)

VERANSTALTUNGEN (Beispiele, ggf. aus gescrapten Inhalten aktualisieren):
- Gänsewoche, Hochzeitsmesse in Marburg usw. – bei konkreten Daten auf aktuelle Website verweisen

FORMATIERUNG:
- Überschriften: <h3>Überschrift</h3>
- Aufzählungen: <ul><li><strong>Titel</strong> – Beschreibung</li></ul>
- Wichtiges: <strong>Text</strong>
- Absätze: <p>Text</p>
- Links: <a href="URL" target="_blank">Link-Text</a>

ANTWORTREGELN:
- Immer höflich und hilfsbereit; Sie-Form
- NIEMALS so tun, als würdest du „nachsehen“ oder „prüfen“ – du hast die Daten bereits (VERFÜGBARE TERMINE etc.). Direkt mit der Antwort beginnen, z. B. „Am 26.02.2026 stehen leider keine Termine …“ oder „Die nächsten freien Termine sind …“. Keine Formulierungen wie „Lassen Sie mich nachsehen“, „Einen Moment bitte“, „Ich prüfe das gerade“.
- Konkrete Infos aus den Quellen nützen; bei Kontakt- oder Buchungswünschen Adresse, Telefon, E-Mail und passende Links angeben
- Bei Kontakt-/Buchungsanfragen (Hochzeit, Taufe, Firmenfeier, allgemeine Anfrage): immer auf https://hof.mellow.studio/kontakt verlinken (klickbar: <a href="https://hof.mellow.studio/kontakt" target="_blank">…</a>).
- Bei FOODbuddy-/Foodtruck-/Catering-Anfragen (Miete, außerhalb des Hofs): immer auf https://hof.mellow.studio/foodbuudy verlinken (klickbar: <a href="https://hof.mellow.studio/foodbuudy" target="_blank">…</a>).
- Bei Vorgespräch / „wann Zeit“ / „freie Termine“: NIEMALS zum Kontaktformular schicken. IMMER den Calendly-Buchungslink nennen und, falls VERFÜGBARE TERMINE im Prompt stehen, diese Zeiten explizit in der Antwort aufführen. Vorgespräche nur donnerstags. Hinweis: Slots können inzwischen vergeben sein – zur Buchung den Link nutzen.
- Keine reinen Link-Listen; immer kurze Erklärung dazu
- Bei Kontaktanfragen immer: Brunnenstr. 16, 35041 Marburg, Tel. 0151 / 12726010, info@behring-gutshof.de sowie Link zum Kontaktformular: https://hof.mellow.studio/kontakt

Du antwortest nur zum Alten Behring Gutshof, FOODbuddy und Gutshof Gin. Bei anderen Themen freundlich auf diese Themen lenken.`;

// Chat-Endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({ 
                error: 'Nachricht ist erforderlich' 
            });
        }

        // Aktuelle Website-Inhalte abrufen
        const currentContent = await getCurrentContent();
        
        // Erstelle erweiterten System-Prompt mit aktuellen Inhalten
        let enhancedSystemPrompt = SYSTEM_PROMPT + '\n\nAKTUELLE WEBSITE-INHALTE:\n';
        
        currentContent.forEach(page => {
            enhancedSystemPrompt += `URL: ${page.url}\nTitel: ${page.title}\nInhalt: ${page.content.substring(0, 2000)}...\n\n`;
            
            // Füge strukturierte Unternehmensangebote hinzu, falls vorhanden
            if (page.companyListings && page.companyListings.length > 0) {
                enhancedSystemPrompt += `AKTUELLE UNTERNEHMENSANGEBOTE (${page.companyListings.length} Angebote):\n`;
                page.companyListings.forEach((company, index) => {
                    enhancedSystemPrompt += `${index + 1}. UNTERNEHMEN: ${company.name}`;
                    if (company.status) enhancedSystemPrompt += ` - Status: ${company.status}`;
                    if (company.date) enhancedSystemPrompt += ` - Datum: ${company.date}`;
                    if (company.description) enhancedSystemPrompt += ` - Beschreibung: ${company.description}`;
                    if (company.price) enhancedSystemPrompt += ` - Preis: ${company.price}`;
                    enhancedSystemPrompt += '\n';
                });
                enhancedSystemPrompt += '\nWICHTIG: Verwende diese aktuellen Unternehmensangebote in deinen Antworten!\n\n';
            }
        });

        if (CALENDLY_URL) {
            enhancedSystemPrompt += '\n\nTERMINBUCHUNG (Calendly): Bei Vorgespräch/Terminwunsch IMMER diesen Link anbieten, NIEMALS das Kontaktformular. Link in Antwort einbinden: <a href="' + CALENDLY_URL + '" target="_blank">Hier können Sie einen freien Termin buchen</a>. URL: ' + CALENDLY_URL;
        }

        const availableSlots = await getCalendlyAvailableTimes();
        if (availableSlots.length > 0) {
            enhancedSystemPrompt += '\n\nVERFÜGBARE TERMINE (von Calendly, nächste 7 Tage; Vorgespräche nur donnerstags): ' + availableSlots.join('; ') + '. PFLICHT bei Fragen wie "Wann habt ihr Zeit" oder "Vorgespräch": (1) Diese konkreten Zeiten in der Antwort nennen (z. B. als Aufzählung). (2) Den Calendly-Buchungslink anbieten. (3) Kurz hinweisen: Vorgespräche nur donnerstags; Slots können inzwischen vergeben sein – bitte über den Link buchen. NICHT das Kontaktformular empfehlen.';
        } else {
            enhancedSystemPrompt += '\n\nHinweis: Keine aktuellen Slots von Calendly geladen. Bei Vorgespräch/Termin trotzdem den Calendly-Buchungslink anbieten (siehe TERMINBUCHUNG), NICHT das Kontaktformular. Vorgespräche finden nur donnerstags statt.';
        }

        // OpenAI API Aufruf
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', // oder 'gpt-4' für bessere Qualität
            messages: [
                {
                    role: 'system',
                    content: enhancedSystemPrompt
                },
                {
                    role: 'user',
                    content: message
                }
            ],
            temperature: 0.7,
            max_tokens: 800
        });

        const reply = completion.choices[0].message.content;

        res.json({ reply });

    } catch (error) {
        console.error('Fehler bei OpenAI API:', error);
        
        if (error.status === 401) {
            return res.status(500).json({ 
                error: 'API-Schlüssel ungültig' 
            });
        }
        
        if (error.status === 429) {
            return res.status(429).json({ 
                error: 'Rate-Limit überschritten. Bitte versuchen Sie es später erneut.' 
            });
        }

        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' 
        });
    }
});

// Erweiterter Chat-Endpoint mit Konversations-Historie
app.post('/api/chat-advanced', async (req, res) => {
    try {
        const { messages } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ 
                error: 'Nachrichten-Array ist erforderlich' 
            });
        }

        // System-Prompt hinzufügen
        const messagesWithSystem = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        // OpenAI API Aufruf
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: messagesWithSystem,
            temperature: 0.7,
            max_tokens: 500
        });

        const reply = completion.choices[0].message.content;

        res.json({ reply });

    } catch (error) {
        console.error('Fehler bei OpenAI API:', error);
        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten' 
        });
    }
});

// Root – damit GET / keine 404 liefert (z. B. Vercel-Logs)
app.get('/', (req, res) => {
    res.type('html').send(`
        <!DOCTYPE html>
        <html lang="de">
        <head><meta charset="UTF-8"><title>Gutshof-KI Emil</title></head>
        <body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:1rem;">
            <h1>Gutshof-KI Emil</h1>
            <p>Backend für den Chat-Assistenten des Alten Behring Gutshofs.</p>
            <p><a href="/health">Health-Check</a> · Chat-API: <code>POST /api/chat</code></p>
        </body>
        </html>
    `);
});

// Favicons – 204, damit Browser/Logs keine 404 erzeugen
app.get('/favicon.ico', (req, res) => { res.status(204).end(); });
app.get('/favicon.png', (req, res) => { res.status(204).end(); });

// Health Check Endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'Server läuft' });
});

// Endpoint zum manuellen Aktualisieren der Inhalte
app.post('/api/refresh-content', async (req, res) => {
    try {
        console.log('Manuelles Aktualisieren der Inhalte...');
        scrapedContent = await scrapeGutshofContent();
        lastScrapeTime = Date.now();
        
        res.json({ 
            status: 'OK', 
            message: 'Inhalte erfolgreich aktualisiert',
            pagesScraped: scrapedContent.length
        });
    } catch (error) {
        console.error('Fehler beim Aktualisieren der Inhalte:', error);
        res.status(500).json({ 
            error: 'Fehler beim Aktualisieren der Inhalte' 
        });
    }
});

// Endpoint zum Abrufen der aktuellen Inhalte
app.get('/api/content', async (req, res) => {
    try {
        const content = await getCurrentContent();
        res.json({ 
            status: 'OK', 
            content: content,
            lastUpdated: new Date(lastScrapeTime).toISOString()
        });
    } catch (error) {
        console.error('Fehler beim Abrufen der Inhalte:', error);
        res.status(500).json({ 
            error: 'Fehler beim Abrufen der Inhalte' 
        });
    }
});

// KI-Such-Endpoint für Unternehmensbörse
app.post('/api/ki-search', async (req, res) => {
    try {
        const { query, type } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ 
                error: 'Suchanfrage ist erforderlich' 
            });
        }

        // Aktuelle Website-Inhalte abrufen
        const currentContent = await getCurrentContent();
        
        // Erstelle erweiterten System-Prompt für KI-Suche
        const searchSystemPrompt = `Du bist ein KI-Assistent für die Unternehmensbörse von TL Consult. Deine Aufgabe ist es, umgangssprachliche Suchanfragen zu analysieren und in konkrete Filterkriterien für die Unternehmensbörse umzuwandeln.

UNTERNEHMENSBÖRSE-INFORMATIONEN:
- Website: https://www.tl-consult.de/unternehmensboerse
- Zielgruppe: Unternehmenskäufer, Investoren, Nachfolger
- Filterkategorien: Branche, Größe, Standort, Umsatz, Mitarbeiterzahl, Alter, Spezialisierung

VERFÜGBARE FILTERKATEGORIEN (basierend auf fs-cmsfilter-field):
1. NAME:
   - Unternehmensname oder Teil davon
   - WICHTIG: Analysiere auch den Namen auf enthaltene Informationen wie:
     * Regionen/Städte: "München GmbH", "Hamburg Solutions", "Berlin Tech"
     * Geschäftsbereiche: "B2B Services", "Medizintechnik AG", "IT Solutions"
     * Branchen: "Maschinenbau GmbH", "Software Entwickler"
   - Beispiel: "Maschinenbau GmbH", "Tech Solutions", "München B2B"

2. BESCHREIBUNG:
   - Unternehmensbeschreibung oder Schlüsselwörter
   - Beispiel: "Produktion", "Dienstleistung", "Innovation"

3. GESUCHT:
   - Status des Unternehmens (Verkauf/Gesucht)
   - Werte: "Verkauf", "Gesucht", "Nachfolge"

4. REGION:
   - Geografische Lage (auch aus dem Namen extrahieren!)
   - Beispiel: "Hessen", "Bayern", "NRW", "Deutschland", "München", "Hamburg"

5. BRANCHE:
   - Industriezweig oder Geschäftsbereich (auch aus dem Namen extrahieren!)
   - Beispiel: "Maschinenbau", "IT", "Gesundheit", "Handwerk", "B2B", "Medizintechnik"

6. PREIS:
   - Kaufpreis oder Preisbereich
   - Beispiel: "1-5 Mio", "unter 1 Mio", "über 10 Mio"

AKTUELLE UNTERNEHMENSANGEBOTE:
${currentContent.find(page => page.url.includes('unternehmensboerse'))?.companyListings?.map((company, index) => 
    `${index + 1}. ${company.name} - ${company.status} - ${company.description}`
).join('\n') || 'Keine aktuellen Angebote verfügbar'}

WICHTIGE GESCHÄFTSBEGRIFFE zu erkennen:
- Unternehmensgröße: "Marktführer", "KMU" (kleines mittelständisches Unternehmen), "Startup", "Familienunternehmen", "Konzern"
- Unternehmensstatus: "Gesucht" (Kaufgesuch), "Verkauf" (Verkaufsangebot), "Nachfolge gesucht", "Übernahme gesucht"
- Geschäftsbereiche: "B2B", "B2C", "B2B2C", "wholesale", "retail"
- Regions-Hinweise in Namen: Städte (München, Hamburg, Berlin), Bundesländer (Hessen, Bayern, NRW)
- Branchen in Namen: "IT", "Maschinenbau", "Medizintechnik", "Handwerk", "Gesundheit"

AUFGABE:
Analysiere die folgende umgangssprachliche Suchanfrage und wandle sie in konkrete Filterkriterien um. 
Berücksichtige dabei ALLE Informationen:
- Namen der Unternehmen (Regionen, Branchen, Geschäftsbereiche)
- Beschreibungen (Marketing-Begriffe, Status-Indikatoren, Geschäftsbereiche)
- Suchbegriffe mit spezieller Bedeutung (Marktführer, KMU, Gesucht, Verkauf, etc.)

ANTWORTFORMAT (JSON):
{
    "interpretation": "Kurze Erklärung der Interpretation der Anfrage",
    "filters": ["Liste der gefundenen Filterkriterien"],
    "finsweetFilters": [
        {
            "field": "fs-cmsfilter-field Name",
            "value": "Filterwert",
            "type": "checkbox|select|range"
        }
    ],
    "suggestions": ["Zusätzliche Suchvorschläge"],
    "confidence": 0.95
}

BEISPIELE:

Anfrage: "Ich suche ein Maschinenbau-Unternehmen"
Antwort: {
    "interpretation": "Suche nach Unternehmen aus der Maschinenbau-Branche",
    "filters": ["Branche: Maschinenbau"],
    "finsweetFilters": [
        {"field": "Branche", "value": "Maschinenbau", "type": "checkbox"}
    ],
    "suggestions": ["Produktionsbetriebe", "Industrieunternehmen"],
    "confidence": 0.95
}

Anfrage: "Unternehmen in München"
Antwort: {
    "interpretation": "Suche nach Unternehmen in München (Region aus Name extrahieren)",
    "filters": ["Region: München"],
    "finsweetFilters": [
        {"field": "Region", "value": "München", "type": "checkbox"}
    ],
    "suggestions": ["Münchner Unternehmen", "Bayrische Firmen"],
    "confidence": 0.9
}

Anfrage: "B2B Unternehmen"
Antwort: {
    "interpretation": "Suche nach B2B-Unternehmen (Branche aus Name/Beschreibung)",
    "filters": ["Branche: B2B"],
    "finsweetFilters": [
        {"field": "Branche", "value": "B2B", "type": "checkbox"}
    ],
    "suggestions": ["B2B Services", "Business-to-Business"],
    "confidence": 0.9
}

Anfrage: "Medizintechnik AG"
Antwort: {
    "interpretation": "Suche nach Medizintechnik-Unternehmen (Branche aus Name)",
    "filters": ["Branche: Medizintechnik"],
    "finsweetFilters": [
        {"field": "Branche", "value": "Medizintechnik", "type": "checkbox"}
    ],
    "suggestions": ["Gesundheitswesen", "Medizintechnik"],
    "confidence": 0.95
}

Anfrage: "Hamburg Solutions"
Antwort: {
    "interpretation": "Suche nach Unternehmen in Hamburg (Region aus Name)",
    "filters": ["Region: Hamburg"],
    "finsweetFilters": [
        {"field": "Region", "value": "Hamburg", "type": "checkbox"}
    ],
    "suggestions": ["Hamburger Unternehmen", "Norddeutsche Firmen"],
    "confidence": 0.9
}

Anfrage: "Marktführer im Bereich IT"
Antwort: {
    "interpretation": "Suche nach marktführenden IT-Unternehmen",
    "filters": ["Branche: IT", "Unternehmensgröße: Marktführer"],
    "finsweetFilters": [
        {"field": "Branche", "value": "IT", "type": "checkbox"}
    ],
    "suggestions": ["Große IT-Unternehmen", "Führende Tech-Firmen"],
    "confidence": 0.8
}

Anfrage: "KMU gesucht"
Antwort: {
    "interpretation": "Suche nach kleinen mittelständischen Unternehmen zum Verkauf",
    "filters": ["Unternehmensgröße: KMU", "Status: Gesucht"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "Verkauf", "type": "checkbox"}
    ],
    "suggestions": ["Kleine Unternehmen", "Mittelständische Betriebe"],
    "confidence": 0.9
}

Anfrage: "Familienunternehmen zum Verkauf in Bayern"
Antwort: {
    "interpretation": "Suche nach Familienunternehmen zum Verkauf in Bayern",
    "filters": ["Unternehmensgröße: Familienunternehmen", "Region: Bayern", "Status: Verkauf"],
    "finsweetFilters": [
        {"field": "Region", "value": "Bayern", "type": "checkbox"},
        {"field": "Gesucht", "value": "Verkauf", "type": "checkbox"}
    ],
    "suggestions": ["Familienbetriebe", "Bayrische Unternehmen"],
    "confidence": 0.95
}

Anfrage: "Ich suche Unternehmen die zum Kauf stehen"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: KAUF)",
    "filters": ["Status: KAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "KAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.95
}

Anfrage: "Unternehmen zum Verkauf gesucht"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: KAUF)",
    "filters": ["Status: KAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "KAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.9
}

Anfrage: "Welche Unternehmen werden verkauft?"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: KAUF)",
    "filters": ["Status: KAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "KAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.9
}

Anfrage: "Ich suche Unternehmen die gekauft werden können"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: KAUF)",
    "filters": ["Status: KAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "KAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.85
}

Anfrage: "Ich suche ein Unternehmen das zum Verkauf steht"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: VERKAUF)",
    "filters": ["Status: VERKAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "VERKAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.95
}

Anfrage: "Welche Unternehmen stehen zum Verkauf?"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: VERKAUF)",
    "filters": ["Status: VERKAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "VERKAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.9
}

Anfrage: "Unternehmen verkaufen"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: VERKAUF)",
    "filters": ["Status: VERKAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "VERKAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.9
}

Anfrage: "Ich will ein Unternehmen kaufen"
Antwort: {
    "interpretation": "Suche nach Unternehmen zum Verkauf (Status: VERKAUF)",
    "filters": ["Status: VERKAUF"],
    "finsweetFilters": [
        {"field": "Gesucht", "value": "VERKAUF", "type": "checkbox"}
    ],
    "suggestions": ["Verkaufsangebote", "Unternehmen zum Verkauf"],
    "confidence": 0.85
}

WICHTIG: Die fs-cmsfilter-field Werte müssen EXAKT mit den Werten in Ihrer Webflow Collection übereinstimmen!
Beispiel: Wenn in Webflow "Maschinenbau" steht, dann muss der Filter-Wert auch "Maschinenbau" sein.

ANALYSE-REGELN für Unternehmensnamen und Beschreibungen:
- Extrahiere Städte/Regionen: "München GmbH" → Region: München
- Extrahiere Branchen: "B2B Services" → Branche: B2B
- Extrahiere Geschäftsbereiche: "Medizintechnik AG" → Branche: Medizintechnik
- Extrahiere Marketing-Begriffe: "Marktführer", "etabliert", "innovativ"
- Extrahiere Status-Indikatoren: "gesucht", "verkauf", "nachfolge", "übernahme"
- Extrahiere Unternehmensgröße: "KMU", "Startup", "Familienunternehmen", "Konzern"
- Extrahiere Geschäftsbereiche: "B2B", "B2C", "wholesale", "retail"

STATUS-ERKENNUNG für fs-cmsfilter-field="Gesucht":
- "zum Verkauf stehen", "verkaufen", "steht zum verkauf", "Verkauf", "verkauft werden" → Wert: "VERKAUF"
- "zum Kauf stehen", "kaufen", "gekauft werden können", "Kauf", "gesucht" → Wert: "KAUF"
- "gesucht", "kaufgesuch", "nachfolge gesucht", "GESUCHT" → Wert: "GESUCHT"
- "nachfolge", "übernahme", "nachfolger gesucht", "NACHFOLGE" → Wert: "NACHFOLGE"

WICHTIG: Prüfe die genauen Werte in Ihrer Webflow Collection für fs-cmsfilter-field="Gesucht"!
Mögliche Werte in Webflow: "VERKAUF" (zum Verkauf), "KAUF" (zum Kauf), "GESUCHT", "NACHFOLGE"
- Verwende EXAKT diese Werte wie sie in Webflow gespeichert sind!
- "Ich suche Unternehmen die zum Verkauf stehen" → filtere nach "VERKAUF"
- "Ich suche Unternehmen die zum Kauf stehen" → filtere nach "KAUF"

- Kombiniere ALLE Informationen für maximale Trefferqualität

Analysiere jetzt diese Anfrage: "${query}"`;

        // OpenAI API Aufruf für KI-Suche
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                {
                    role: 'system',
                    content: searchSystemPrompt
                },
                {
                    role: 'user',
                    content: query
                }
            ],
            temperature: 0.3,
            max_tokens: 500
        });

        const reply = completion.choices[0].message.content;
        
        // Versuche JSON zu parsen
        let searchResult;
        try {
            searchResult = JSON.parse(reply);
        } catch (parseError) {
            // Fallback falls JSON-Parsing fehlschlägt
            searchResult = {
                interpretation: reply,
                filters: ["Allgemeine Suche"],
                finsweetFilters: [],
                suggestions: [],
                confidence: 0.7
            };
        }

        res.json(searchResult);

    } catch (error) {
        console.error('Fehler bei KI-Suche:', error);
        
        if (error.status === 401) {
            return res.status(500).json({ 
                error: 'API-Schlüssel ungültig' 
            });
        }
        
        if (error.status === 429) {
            return res.status(429).json({ 
                error: 'Rate-Limit überschritten. Bitte versuchen Sie es später erneut.' 
            });
        }

        res.status(500).json({ 
            error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut.' 
        });
    }
});

// Server starten
app.listen(PORT, () => {
    console.log(`🚀 Gutshof-KI (Emil) Server läuft auf Port ${PORT}`);
    console.log(`💬 Chat-API verfügbar unter: http://localhost:${PORT}/api/chat`);
    console.log(`🔄 Content-Refresh verfügbar unter: http://localhost:${PORT}/api/refresh-content`);
    console.log(`📊 Content-Status verfügbar unter: http://localhost:${PORT}/api/content`);
    
    if (!process.env.OPENAI_API_KEY) {
        console.warn('⚠️  WARNUNG: OPENAI_API_KEY nicht gesetzt!');
    }
    
    // Initiales Scraping beim Start
    console.log('🔄 Starte initiales Scraping der Gutshof-Webseiten...');
    getCurrentContent().then(() => {
        console.log('✅ Initiales Scraping abgeschlossen');
    }).catch(error => {
        console.error('❌ Fehler beim initialen Scraping:', error.message);
    });
});

