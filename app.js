/**
 * app.js - PV Dashboard Sonnenblumenweg
 * Steuerung der MQTT-Kommunikation und Visualisierung
 */

// --- 1. Konfiguration ---
const HIVE_MQ_HOST = 'bb23c26981ce486a9de6a8d83cff9f90.s1.eu.hivemq.cloud';
const HIVE_MQ_PORT = 8884;
const HIVE_MQ_USER = 'sbwwetter';
const HIVE_MQ_PASS = 'pbd7chu6kba!zrd2GTG';

// Zustandsvariablen für Berechnungen
let currentDC = 0;
let currentAC = 0;
let pvChart;

// Zuordnung der Topics zu UI-Elementen
const topics = {
    'home/haus/zentral/pv/wrstatus': { id: 'wr-status', type: 'text' },
    'home/haus/zentral/pv/dcleistung': { id: 'pv-dc', unit: ' kW', chartIndex: 0 },
    'home/haus/zentral/pv/leistung': { id: 'pv-ac', unit: ' kW', chartIndex: 1 },
    'home/haus/zentral/Momentanleistung': { id: 'net-power', unit: ' kW', chartIndex: 2 },
    'home/haus/zentral/pv/tagesenergy': { id: 'pv-day-energy', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalweek_energy': { id: 'pv-week', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalmonth_energy': { id: 'pv-month', unit: ' kWh' },
    'home/haus/zentral/pv/pv_anlage_totalyear_energy': { id: 'pv-year', unit: ' kWh' }
};

// --- 2. Chart Initialisierung ---
function initChart() {
    const ctx = document.getElementById('pvChart').getContext('2d');
    pvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
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
                x: { ticks: { maxTicksLimit: 10 } }
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

    const element = document.getElementById(config.id);
    const value = isNaN(parseFloat(message)) ? message : parseFloat(message).toFixed(2);

    // UI Aktualisierung
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

    // Berechnungswerte speichern
    if (topic === 'home/haus/zentral/pv/dcleistung') currentDC = parseFloat(value);
    if (topic === 'home/haus/zentral/pv/leistung') currentAC = parseFloat(value);

    // Chart aktualisieren falls Topic im Chart abgebildet wird
    if (config.chartIndex !== undefined) {
        updateChartData(config.chartIndex, value);
    }
});

/**
 * Aktualisiert die Chart-Daten und berechnet die Akkuleistung
 */
function updateChartData(index, val) {
    const now = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Zeitstempel nur beim ersten Dataset hinzufügen
    if (index === 0) {
        pvChart.data.labels.push(now);
        if (pvChart.data.labels.length > 30) pvChart.data.labels.shift();
    }

    // Einzelwert hinzufügen
    pvChart.data.datasets[index].data.push(val);
    if (pvChart.data.datasets[index].data.length > 30) pvChart.data.datasets[index].data.shift();

    // Berechnung Akkuleistung: Differenz aus DC und AC
    const battPower = (currentDC - currentAC).toFixed(2);
    pvChart.data.datasets[3].data.push(battPower);
    if (pvChart.data.datasets[3].data.length > 30) pvChart.data.datasets[3].data.shift();

    pvChart.update('none'); // Update ohne Animation für Performance
}

// Start der Anwendung
window.onload = () => {
    initChart();
};