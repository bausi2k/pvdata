/**
 * app.js - PV Dashboard Sonnenblumenweg
 * Steuerung der MQTT-Kommunikation und Visualisierung (mit Historien-Topic)
 */

// --- 1. Konfiguration ---
const HIVE_MQ_HOST = 'bb23c26981ce486a9de6a8d83cff9f90.s1.eu.hivemq.cloud';
const HIVE_MQ_PORT = 8884;
const HIVE_MQ_USER = 'sbwwetter';
const HIVE_MQ_PASS = 'pbd7chu6kba!zrd2GTG';

// Zustandsvariablen für Berechnungen
let currentDC = 0;
let currentAC = 0;
let currentNet = 0; // Speichert die aktuelle Netzleistung
let pvChart;

// Zuordnung der Topics zu UI-Elementen
const topics = {
    'home/haus/zentral/pv/wrstatus': { id: 'wr-status', type: 'text' },
    'home/haus/zentral/pv/dcleistung': { id: 'pv-dc', unit: ' kW' }, 
    'home/haus/zentral/pv/leistung': { id: 'pv-ac', unit: ' kW' },   
    // WICHTIG: Das Topic wurde angepasst auf pv/Momentanleistung
    'home/haus/zentral/pv/Momentanleistung': { id: 'net-power', unit: ' kW' }, 
    'home/haus/zentral/pv/tagesenergy': { id: 'pv-day-energy', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalweek_energy': { id: 'pv-week', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalmonth_energy': { id: 'pv-month', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalyear_energy': { id: 'pv-year', unit: ' kWh' },
    // Separates Topic für die Node-RED Historie
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
            labels: [], 
            datasets: [
                { label: 'DC-Leistung (kW)', data: [], borderColor: '#fbc02d', backgroundColor: '#fbc02d33', fill: false, tension: 0.3 },
                { label: 'AC-Leistung (kW)', data: [], borderColor: '#1976d2', backgroundColor: '#1976d233', fill: false, tension: 0.3 },
                { label: 'Netzleistung (kW)', data: [], borderColor: '#d32f2f', backgroundColor: '#d32f2f33', fill: false, tension: 0.3 },
                { label: 'Akkuleistung (kW)', data: [], borderColor: '#7b1fa2', backgroundColor: '#7b1fa233', fill: true, tension: 0.3, borderDash: [5, 5] },
                // Fünfte Linie für die Gesamtleistung (Grün)
                { label: 'Gesamtleistung (kW)', data: [], borderColor: '#388e3c', backgroundColor: '#388e3c33', fill: false, tension: 0.3 } 
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { title: { display: true, text: 'Leistung (kW)' } },
                x: { ticks: { maxTicksLimit: 12 } } 
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
            const totalData = []; 

            // JSON durchlaufen und Arrays für den Chart füllen
            historyData.forEach(point => {
                labels.push(point.time);
                dcData.push(point.dc);
                acData.push(point.ac);
                netData.push(point.net);
                
                // Akkuleistung und Gesamtleistung kommen nun fix und fertig aus Node-RED
                battData.push(point.batt !== undefined ? Number(point.batt) : 0);
                totalData.push(point.total !== undefined ? Number(point.total) : 0);
            });

            // Chart mit den neuen Arrays aktualisieren
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

    const value = isNaN(parseFloat(message)) ? message : parseFloat(message).toFixed(2);

    if (config.type === 'text') {
        element.textContent = message;
        if (message.toLowerCase().includes('netz') || message.toLowerCase().includes('ok')) {
            element.className = 'status-badge status-online';
        } else {
            element.className = 'status-badge status-offline';
        }
    } else {
        element.innerHTML = `${value}<span class="unit">${config.unit}</span>`;
    }

    // --- Live-Berechnung für die Gesamtleistung Kachel ---
    if (topic === 'home/haus/zentral/pv/dcleistung') currentDC = isNaN(Number(value)) ? 0 : Number(value);
    if (topic === 'home/haus/zentral/pv/leistung') currentAC = isNaN(Number(value)) ? 0 : Number(value);
    // WICHTIG: Das Topic wurde angepasst
    if (topic === 'home/haus/zentral/pv/Momentanleistung') currentNet = isNaN(Number(value)) ? 0 : Number(value);

    // WICHTIG: Das Topic wurde angepasst
    if (topic === 'home/haus/zentral/pv/leistung' || topic === 'home/haus/zentral/pv/Momentanleistung') {
        const total = (currentAC + currentNet).toFixed(2);
        const totalElement = document.getElementById('pv-total');
        if (totalElement) {
            totalElement.innerHTML = `${total}<span class="unit"> kW</span>`;
        }
    }
});

// Start der Anwendung
window.onload = () => {
    initChart();
};