/**
 * app.js - PV Dashboard Sonnenblumenweg
 * Steuerung der MQTT-Kommunikation und Visualisierung
 */

// --- 1. Konfiguration ---
const HIVE_MQ_HOST = 'bb23c26981ce486a9de6a8d83cff9f90.s1.eu.hivemq.cloud';
const HIVE_MQ_PORT = 8884;
const HIVE_MQ_USER = 'sbwwetter';
const HIVE_MQ_PASS = 'pbd7chu6kba!zrd2GTG';

// Zustandsvariablen für Berechnungen der Live-Kachel
let currentDC = 0;
let currentAC = 0;
let currentNet = 0; 
let pvChart;

// Wörterbuch für die Wechselrichter-Statuscodes
const inverterStatuses = {
    "0": "Standby: initializing",
    "1": "Standby: detecting insulation resistance",
    "2": "Standby: detecting irradiation",
    "3": "Standby: grid detecting",
    "256": "Starting",
    "512": "On-grid",
    "513": "Grid connection: power limited",
    "514": "Grid connection: self-derating",
    "515": "Off-grid Running",
    "768": "Shutdown: fault",
    "769": "Shutdown: command",
    "770": "Shutdown: OVGR",
    "771": "Shutdown: communication disconnected",
    "772": "Shutdown: power limited",
    "773": "Shutdown: manual startup required",
    "774": "Shutdown: DC switches disconnected",
    "775": "Shutdown: rapid cutoff",
    "776": "Shutdown: input underpower",
    "780": "Shutdown: Battery End of Discharge",
    "1025": "Grid scheduling: cosΦ-P curve",
    "1026": "Grid scheduling: Q-U curve",
    "1027": "Grid scheduling: PF- U curve",
    "1028": "Grid scheduling: dry contact",
    "1029": "Grid scheduling: Q-P curve",
    "1280": "Spot-check ready",
    "1281": "Spot-checking",
    "1536": "Inspecting",
    "1792": "AFCI self check",
    "2048": "I-V scanning",
    "2304": "DC input detection",
    "2560": "Running: off-grid charging",
    "40960": "Standby: no irradiation"
};

// Zuordnung der Topics zu UI-Elementen
const topics = {
    'home/haus/zentral/pv/wrstatus': { id: 'wr-status', type: 'text' },
    'home/haus/zentral/pv/dcleistung': { id: 'pv-dc', unit: ' kW', decimals: 2 }, 
    'home/haus/zentral/pv/leistung': { id: 'pv-ac', unit: ' kW', decimals: 2 },   
    
    // ANGEPASST: Netzleistung auf 3 Nachkommastellen
    'home/haus/zentral/pv/Momentanleistung': { id: 'net-power', unit: ' kW', decimals: 3 }, 
    
    'home/haus/zentral/pv/tagesenergy': { id: 'pv-day-energy', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalweek_energy': { id: 'pv-week', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalmonth_energy': { id: 'pv-month', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalyear_energy': { id: 'pv-year', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/gesamtenergie': { id: 'pv-total-energy', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/luna/soc': { id: 'pv-battery-soc', unit: ' %', decimals: 0 },
    
    // NEU: Akkuleistung (Laden/Entladen) auf 3 Nachkommastellen
    'home/haus/zentral/pv/luna/power': { id: 'pv-battery-power', unit: ' kW', decimals: 3 },
    
    'home/haus/zentral/pv/historie': { type: 'history' } 
};

// Hilfsfunktion für die deutsche Zahlenformatierung
function formatNumber(num, decimals) {
    return new Intl.NumberFormat('de-DE', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    }).format(num);
}

// --- 2. Chart Initialisierung ---
function initChart() {
    const canvasElement = document.getElementById('pvChart');
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    
    pvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [
                { label: 'DC-Leistung (kW)', data: [], borderColor: '#fbc02d', backgroundColor: '#fbc02d33', fill: false, tension: 0.3 },
                { label: 'AC-Leistung (kW)', data: [], borderColor: '#1976d2', backgroundColor: '#1976d233', fill: false, tension: 0.3 },
                { label: 'Netzleistung (kW)', data: [], borderColor: '#d32f2f', backgroundColor: '#d32f2f33', fill: false, tension: 0.3 },
                { label: 'Akkuleistung (kW)', data: [], borderColor: '#7b1fa2', backgroundColor: '#7b1fa233', fill: true, tension: 0.3, borderDash: [5, 5] },
                { label: 'Gesamtleistung (kW)', data: [], borderColor: '#388e3c', backgroundColor: '#388e3c33', fill: false, tension: 0.3 } 
            ]
        },
        options: {
            locale: 'de-DE', 
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Leistung (kW)' } },
                x: { ticks: { maxTicksLimit: 12 } } 
            },
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += formatNumber(context.parsed.y, 2);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- 3. MQTT Verbindung aufbauen ---
const clientUrl = `wss://${HIVE_MQ_HOST}:${HIVE_MQ_PORT}/mqtt`;
const options = {
    clientId: 'pv-dashboard-' + Math.random().toString(16).substr(2, 8),
    username: HIVE_MQ_USER,
    password: HIVE_MQ_PASS,
    clean: true
};

const client = mqtt.connect(clientUrl, options);
const mqttStatusElement = document.getElementById('mqtt-status');

client.on('connect', () => {
    mqttStatusElement.textContent = 'Verbunden ✅';
    mqttStatusElement.style.color = 'green';
    client.subscribe(Object.keys(topics));
});

client.on('message', (topic, payload) => {
    const message = payload.toString().trim();
    const config = topics[topic];
    if (!config) return;

    // ----- SPEZIALFALL: Historien-Datenbank von Node-RED -----
    if (config.type === 'history') {
        try {
            const historyData = JSON.parse(message);
            
            const labels = [];
            const dcData = [];
            const acData = [];
            const netData = [];
            const battData = [];
            const totalData = []; 

            historyData.forEach(point => {
                labels.push(point.time);
                dcData.push(point.dc);
                acData.push(point.ac);
                netData.push(point.net);
                battData.push(point.batt !== undefined ? Number(point.batt) : 0);
                totalData.push(point.total !== undefined ? Number(point.total) : 0);
            });

            if (pvChart) {
                pvChart.data.labels = labels;
                pvChart.data.datasets[0].data = dcData;
                pvChart.data.datasets[1].data = acData;
                pvChart.data.datasets[2].data = netData;
                pvChart.data.datasets[3].data = battData;
                pvChart.data.datasets[4].data = totalData; 
                pvChart.update();
            }
        } catch (e) {
            console.error('Fehler beim Parsen der PV-Historie:', e);
        }
        return; 
    }

    // ----- STANDARD: Live-Werte für die Kacheln -----
    const element = document.getElementById(config.id);
    if (!element) return;

    // --- LOGIK: Wechselrichter-Status ---
    if (config.type === 'text') {
        let statusText = inverterStatuses[message] ? inverterStatuses[message] : message;
        element.textContent = statusText;

        const textLower = statusText.toLowerCase();
        
        if (textLower.includes('on-grid') || textLower.includes('running') || textLower.includes('ok')) {
            element.className = 'status-badge status-online';
            element.style.backgroundColor = '#4caf50'; 
            element.style.color = 'white';
        } else if (textLower.includes('shutdown') || textLower.includes('fault') || textLower.includes('disconnected')) {
            element.className = 'status-badge status-offline';
            element.style.backgroundColor = '#f44336'; 
            element.style.color = 'white';
        } else {
            element.className = 'status-badge';
            element.style.backgroundColor = '#607d8b'; 
            element.style.color = 'white';
        }
        return; 
    }

    // --- Werteverarbeitung für Zahlen ---
    const numericValue = parseFloat(message);
    if (!isNaN(numericValue)) {
        let displayValue = formatNumber(numericValue, config.decimals);
        let extraText = "";

        // Text-Logik für Netzleistung
        if (topic === 'home/haus/zentral/pv/Momentanleistung') {
            if (numericValue < 0) {
                extraText = " (einspeisen)";
                displayValue = formatNumber(Math.abs(numericValue), config.decimals); // Minuszeichen für Anzeige entfernen
            } else if (numericValue > 0) {
                extraText = " (beziehen)";
            }
        } 
        // Text-Logik für Akku Leistung
        else if (topic === 'home/haus/zentral/pv/luna/power') {
            if (numericValue < 0) {
                extraText = " (laden)";
                displayValue = formatNumber(Math.abs(numericValue), config.decimals); // Minuszeichen für Anzeige entfernen
            } else if (numericValue > 0) {
                extraText = " (entladen)";
            }
        }

        element.innerHTML = `${displayValue}<span class="unit">${config.unit}${extraText}</span>`;
    } else {
        element.innerHTML = `${message}<span class="unit">${config.unit}</span>`;
    }

    // --- Live-Berechnung für die Gesamtleistung Kachel ---
    if (topic === 'home/haus/zentral/pv/dcleistung') currentDC = isNaN(numericValue) ? 0 : numericValue;
    if (topic === 'home/haus/zentral/pv/leistung') currentAC = isNaN(numericValue) ? 0 : numericValue;
    if (topic === 'home/haus/zentral/pv/Momentanleistung') currentNet = isNaN(numericValue) ? 0 : numericValue;

    if (topic === 'home/haus/zentral/pv/leistung' || topic === 'home/haus/zentral/pv/Momentanleistung') {
        // Hier wird mit dem echten Wert inkl. Minuszeichen gerechnet!
        const total = currentAC + currentNet; 
        const displayTotal = formatNumber(total, 2);
        
        const totalElement = document.getElementById('pv-total');
        if (totalElement) {
            totalElement.innerHTML = `${displayTotal}<span class="unit"> kW</span>`;
        }
    }
});

// Start der Anwendung
window.onload = () => {
    initChart();
};