/**
 * app.js - PV Dashboard Sonnenblumenweg
 * Steuerung der MQTT-Kommunikation und Visualisierung (mit Historien-Topic)
 */

// --- 1. Konfiguration ---
const HIVE_MQ_HOST = 'bb23c26981ce486a9de6a8d83cff9f90.s1.eu.hivemq.cloud';
const HIVE_MQ_PORT = 8884;
const HIVE_MQ_USER = 'sbwwetter';
const HIVE_MQ_PASS = 'pbd7chu6kba!zrd2GTG';

let pvChart;

// Zuordnung der Topics zu UI-Elementen
const topics = {
    'home/haus/zentral/pv/wrstatus': { id: 'wr-status', type: 'text' },
    'home/haus/zentral/pv/dcleistung': { id: 'pv-dc', unit: ' kW' }, // Live-Wert Kachel
    'home/haus/zentral/pv/leistung': { id: 'pv-ac', unit: ' kW' },   // Live-Wert Kachel
    'home/haus/zentral/Momentanleistung': { id: 'net-power', unit: ' kW' }, // Live-Wert Kachel
    'home/haus/zentral/pv/tagesenergy': { id: 'pv-day-energy', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalweek_energy': { id: 'pv-week', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalmonth_energy': { id: 'pv-month', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalyear_energy': { id: 'pv-year', unit: ' kWh' },
    // NEU: Separates Topic für die Node-RED Historie
    'home/haus/zentral/pv/historie': { type: 'history' } 
};

// --- 2. Chart Initialisierung ---
function initChart() {
    const canvasElement = document.getElementById('pvChart');
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    
    pvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Wird durch das Node-RED JSON gefüllt
            datasets: [
                { label: 'DC-Leistung (kW)', data: [], borderColor: '#fbc02d', backgroundColor: '#fbc02d33', fill: false, tension: 0.3 },
                { label: 'AC-Leistung (kW)', data: [], borderColor: '#1976d2', backgroundColor: '#1976d233', fill: false, tension: 0.3 },
                { label: 'Netzleistung (kW)', data: [], borderColor: '#d32f2f', backgroundColor: '#d32f2f33', fill: false, tension: 0.3 },
                { label: 'Akkuleistung (kW)', data: [], borderColor: '#7b1fa2', backgroundColor: '#7b1fa233', fill: true, tension: 0.3, borderDash: [5, 5] }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Leistung (kW)' } },
                x: { ticks: { maxTicksLimit: 12 } } // Verhindert zu viele Uhrzeiten auf der X-Achse
            },
            plugins: {
                legend: { position: 'top' }
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
    // Alle konfigurierten Topics abonnieren
    client.subscribe(Object.keys(topics));
});

client.on('message', (topic, payload) => {
    const message = payload.toString();
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

            // JSON durchlaufen und Arrays für den Chart füllen
            historyData.forEach(point => {
                labels.push(point.time);
                dcData.push(point.dc);
                acData.push(point.ac);
                netData.push(point.net);
                // Akkuleistung direkt hier berechnen: DC - AC
                battData.push((point.dc - point.ac).toFixed(2));
            });

            // Chart mit den neuen Arrays aktualisieren
            if (pvChart) {
                pvChart.data.labels = labels;
                pvChart.data.datasets[0].data = dcData;
                pvChart.data.datasets[1].data = acData;
                pvChart.data.datasets[2].data = netData;
                pvChart.data.datasets[3].data = battData;
                pvChart.update();
            }
        } catch (e) {
            console.error('Fehler beim Parsen der PV-Historie:', e);
        }
        return; // Nach der Verarbeitung der Historie hier abbrechen
    }

    // ----- STANDARD: Live-Werte für die Kacheln -----
    const element = document.getElementById(config.id);
    if (!element) return;

    const value = isNaN(parseFloat(message)) ? message : parseFloat(message).toFixed(2);

    if (config.type === 'text') {
        element.textContent = message;
        // Optische Rückmeldung für Wechselrichter-Status
        if (message.toLowerCase().includes('netz') || message.toLowerCase().includes('ok')) {
            element.className = 'status-badge status-online';
        } else {
            element.className = 'status-badge status-offline';
        }
    } else {
        element.innerHTML = `${value}<span class="unit">${config.unit}</span>`;
    }
});

// Start der Anwendung
window.onload = () => {
    initChart();
};