const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path'); // Import path module

// LOAD SECRETS (Only works locally. On server, we use Environment Variables)
require('dotenv').config({ path: './secret.env' });

const app = express();
app.use(cors());
app.use(express.json());

// --- SECTION 0: SERVE FRONTEND (CRITICAL FIX) ---
// This tells the server to serve index.html and other files in this folder
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

// --- DEBUG LOG ---
console.log("------------------------------------------------");
if (process.env.PERPLEXITY_API_KEY) console.log("✅ AI SYSTEM ONLINE");
else console.error("❌ MISSING AI KEY");
console.log("------------------------------------------------\n");

// --- 1. ROBUST WEATHER ---
app.get('/api/weather', async (req, res) => {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'Location required' });

    try {
        const weatherRes = await axios.get(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const geoRes = await axios.get(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&count=1&format=json&language=en`);

        const code = weatherRes.data.current_weather.weathercode;
        let condition = "Clear Sky";
        if (code > 2) condition = "Cloudy";
        if (code >= 50) condition = "Rain";
        if (code >= 71) condition = "Snow";
        if (code >= 95) condition = "Thunderstorm";

        const locationName = geoRes.data.results && geoRes.data.results[0] 
            ? geoRes.data.results[0].name 
            : "Unknown Sector";

        res.json({
            temp: Math.round(weatherRes.data.current_weather.temperature),
            city: locationName,
            description: condition
        });

    } catch (error) {
        console.error("Weather Error:", error.message);
        res.status(500).json({ error: 'Weather unavailable' });
    }
});

// --- 2. STOCKS ---
app.get('/api/stocks', async (req, res) => {
    try {
        const symbols = ['SPY', 'AAPL', 'BTC-USD'];
        const stockData = [];

        for (const sym of symbols) {
            // Use standard process.env variable
            const url = `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${process.env.STOCK_API_KEY}`;
            const response = await axios.get(url);
            const data = response.data;
            
            if(data.c) {
                const change = ((data.c - data.pc) / data.pc) * 100;
                stockData.push({
                    name: sym.replace("-USD", ""),
                    val: data.c.toFixed(2),
                    change: (change >= 0 ? "+" : "") + change.toFixed(2) + "%",
                    dir: change >= 0 ? "up" : "down"
                });
            }
        }
        res.json(stockData);
    } catch (error) {
        res.status(500).json({ error: 'Stocks unavailable' });
    }
});

// --- 3. TRUTH DETECTOR ---
app.post('/api/analyze', async (req, res) => {
    const { text } = req.body;
    
    try {
        const response = await axios.post('https://api.perplexity.ai/chat/completions', {
            model: "sonar-pro",
            messages: [
                {
                    role: "system",
                    content: `You are a high-tech Truth Scanner. Search web. Return JSON only. Schema: {"verdict": "REAL/FAKE", "confidence": "99%", "reasoning": "concise", "sources": [{"title": "X", "url": "Y"}]}`
                },
                { role: "user", content: text }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let aiText = response.data.choices[0].message.content;
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
            res.json(JSON.parse(jsonMatch[0]));
        } else {
            throw new Error("Invalid AI JSON");
        }

    } catch (error) {
        console.error("[AI ERROR]:", error.message);
        res.json({ verdict: "ERROR", confidence: "0%", reasoning: "AI Connection Lost.", sources: [] });
    }
});

// --- FALLBACK ROUTE ---
// If user goes to a route that doesn't exist, send them back to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => console.log(`> SYSTEM ONLINE: http://localhost:${PORT}`));