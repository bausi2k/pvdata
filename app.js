/**
 * app.js - PV Dashboard Sonnenblumenweg v1.2.3
 * Fokus: Dynamische Nullpunkt-Progressbars & reparierte Batterie-Icons
 */

// --- 1. Konfiguration ---
const HIVE_MQ_HOST = 'bb23c26981ce486a9de6a8d83cff9f90.s1.eu.hivemq.cloud';
const HIVE_MQ_PORT = 8884;
const HIVE_MQ_USER = 'sbwwetter';
const HIVE_MQ_PASS = 'pbd7chu6kba!zrd2GTG';

let currentDC = 0, currentAC = 0, currentNet = 0, pvChart;

const inverterStatuses = {
    "0": "Standby: initializing", "1": "Standby: detecting insulation resistance",
    "2": "Standby: detecting irradiation", "3": "Standby: grid detecting",
    "256": "Starting", "512": "On-grid", "513": "Grid connection: power limited",
    "514": "Grid connection: self-derating", "515": "Off-grid Running",
    "768": "Shutdown: fault", "769": "Shutdown: command", "770": "Shutdown: OVGR",
    "771": "Shutdown: communication disconnected", "772": "Shutdown: power limited",
    "773": "Shutdown: manual startup required", "774": "Shutdown: DC switches disconnected",
    "775": "Shutdown: rapid cutoff", "776": "Shutdown: input underpower",
    "780": "Shutdown: Battery End of Discharge", "40960": "Standby: no irradiation"
};

const topics = {
    'home/haus/zentral/pv/wrstatus': { id: 'wr-status', type: 'text' },
    'home/haus/zentral/pv/dcleistung': { id: 'pv-dc', unit: ' kW', decimals: 2 }, 
    'home/haus/zentral/pv/leistung': { id: 'pv-ac', unit: ' kW', decimals: 2 },   
    'home/haus/zentral/pv/Momentanleistung': { id: 'net-power', unit: ' kW', decimals: 3 }, 
    'home/haus/zentral/pv/tagesenergy': { id: 'pv-day-energy', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalweek_energy': { id: 'pv-week', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalmonth_energy': { id: 'pv-month', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/pv_anlage_totalyear_energy': { id: 'pv-year', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/gesamtenergie': { id: 'pv-total-energy', unit: ' kWh', decimals: 2 },
    'home/haus/zentral/pv/luna/soc': { id: 'pv-battery-soc', unit: ' %', decimals: 0 },
    'home/haus/zentral/pv/luna/power': { id: 'pv-battery-power', unit: ' kW', decimals: 3 },
    'home/haus/zentral/pv/stats/comparison': { type: 'json-stats' },
    'home/haus/zentral/pv/historie': { type: 'history' } 
};

// Hilfsfunktionen
function formatNumber(num, decimals) {
    return new Intl.NumberFormat('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(num);
}

function triggerFlash(element) {
    element.classList.remove('value-changed');
    void element.offsetWidth; 
    element.classList.add('value-changed');
}

// --- 2. Chart Initialisierung ---
function initChart() {
    const canvas = document.getElementById('pvChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--pico-color').trim();

    pvChart = new Chart(ctx, {
        type: 'line',
        data: { labels: [], datasets: [
            { label: 'DC (kW)', data: [], borderColor: '#fbc02d', tension: 0.3 },
            { label: 'AC (kW)', data: [], borderColor: '#1976d2', tension: 0.3 },
            { label: 'Netz (kW)', data: [], borderColor: '#d32f2f', tension: 0.3 },
            { label: 'Akku (kW)', data: [], borderColor: '#7b1fa2', borderDash: [5, 5], tension: 0.3 },
            { label: 'Gesamt (kW)', data: [], borderColor: '#388e3c', tension: 0.3 }
        ]},
        options: { 
            locale: 'de-DE', 
            responsive: true, 
            maintainAspectRatio: false, 
            color: textColor, 
            scales: { 
                y: { ticks: { color: textColor } }, 
                x: { ticks: { color: textColor } } 
            } 
        }
    });
}

// --- 3. MQTT Client ---
const client = mqtt.connect(`wss://${HIVE_MQ_HOST}:${HIVE_MQ_PORT}/mqtt`, {
    clientId: 'pv-dashboard-' + Math.random().toString(16).substr(2, 8),
    username: HIVE_MQ_USER, password: HIVE_MQ_PASS, clean: true
});

client.on('connect', () => {
    document.getElementById('mqtt-status').textContent = 'Verbunden ✅';
    client.subscribe(Object.keys(topics));
});

client.on('message', (topic, payload) => {
    const message = payload.toString().trim();
    const config = topics[topic];
    if (!config) return;

    if (config.type === 'history') {
        try {
            const data = JSON.parse(message);
            if (pvChart) {
                pvChart.data.labels = data.map(p => p.time);
                pvChart.data.datasets[0].data = data.map(p => p.dc);
                pvChart.data.datasets[1].data = data.map(p => p.ac);
                pvChart.data.datasets[2].data = data.map(p => p.net);
                pvChart.data.datasets[3].data = data.map(p => p.batt);
                pvChart.data.datasets[4].data = data.map(p => p.total);
                pvChart.update();
            }
        } catch (e) { console.error("History Error:", e); }
        return;
    }

    // ----- SPEZIALFALL: Node-RED Statistiken mit dynamischen Progress Bars -----
    if (config.type === 'json-stats') {
        try {
            const stats = JSON.parse(message);
            const heuteEl = document.getElementById('pv-day-energy');
            const heute = heuteEl ? parseFloat(heuteEl.innerText.replace(',', '.')) || 0 : 0;

            const render = (id, data) => {
                const el = document.getElementById(id);
                if (!el || !data) return;
                
                const diff = heute - data.schnitt;
                const color = diff >= 0 ? 'var(--pico-primary)' : '#e53e3e';
                
                // Dynamisches Limit berechnen (Rundet auf nächste 5 auf, mind. 5)
                let limit = Math.ceil(Math.abs(diff) / 5) * 5;
                if (limit === 0) limit = 5;

                // Da Progress Bars bei 0 anfangen, verschieben wir den Wert um das Limit
                const progressMax = limit * 2;
                const progressVal = limit + diff;

                el.innerHTML = `
                    <div style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: flex-end;">
                        <small>Schnitt (${data.tage} T):</small>
                        <strong>${formatNumber(data.schnitt, 2)} kWh</strong>
                    </div>
                    
                    <progress value="${progressVal}" max="${progressMax}" style="--pico-progress-color: ${color}; margin-bottom: 0.2rem; height: 12px;"></progress>
                    
                    <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--pico-muted-color); margin-bottom: 1rem;">
                        <span>-${limit}</span>
                        <span>0</span>
                        <span>+${limit}</span>
                    </div>
                    
                    <div style="text-align: center;">
                        <small>Abweichung: </small>
                        <strong style="color: ${color}">${diff >= 0 ? '+' : ''}${formatNumber(diff, 2)} kWh</strong>
                    </div>
                `;
            };

            render('stats-week', stats.week);
            render('stats-month', stats.month);
            render('stats-year', stats.year);
        } catch (e) { console.error("Stats Error:", e); }
        return;
    }

    // ----- STANDARD: Live-Kacheln -----
    const element = document.getElementById(config.id);
    if (!element) return;

    if (config.type === 'text') {
        let statusText = inverterStatuses[message] || message;
        if (element.textContent !== statusText) {
            element.textContent = statusText;
            element.className = statusText.toLowerCase().includes('grid') ? 'status-badge status-online' : 'status-badge';
        }
    } else {
        const val = parseFloat(message);
        if (!isNaN(val)) {
            let displayVal = formatNumber(val, config.decimals);
            let extra = "";
            
            if (topic.includes('Momentanleistung') || topic.includes('luna/power')) {
                const isNet = topic.includes('Momentanleistung');
                extra = `<br><small class='secondary'>${val < 0 ? (isNet ? 'einspeisen' : 'laden') : (isNet ? 'beziehen' : 'entladen')}</small>`;
                displayVal = formatNumber(Math.abs(val), config.decimals);
            } 
            // WIEDERHERGESTELLT: Batterie-Icon Logik (Farbe UND Icon-Klasse)
            else if (topic.includes('luna/soc')) {
                const icon = document.getElementById('battery-icon');
                if (icon) {
                    let iconClass = 'fa-battery-full'; 
                    let iconColor = '#4caf50'; 

                    if (val <= 10) {
                        iconClass = 'fa-battery-empty'; iconColor = '#f44336'; 
                    } else if (val <= 30) {
                        iconClass = 'fa-battery-quarter'; iconColor = '#ff9800'; 
                    } else if (val <= 50) {
                        iconClass = 'fa-battery-half'; iconColor = '#ffc107'; 
                    } else if (val <= 85) {
                        iconClass = 'fa-battery-three-quarters'; iconColor = '#8bc34a'; 
                    } 

                    icon.className = `fas ${iconClass} data-value`;
                    icon.style.color = iconColor;
                }
            }

            const newHTML = `${displayVal}<span class="unit">${config.unit}</span>${extra}`;
            if (element.innerHTML !== newHTML) {
                element.innerHTML = newHTML;
                triggerFlash(element);
            }
        }
    }

	if (topic === 'home/haus/zentral/pv/dcleistung') currentDC = parseFloat(message) || 0;
	    if (topic === 'home/haus/zentral/pv/leistung') currentAC = parseFloat(message) || 0;
	    if (topic === 'home/haus/zentral/pv/Momentanleistung') currentNet = parseFloat(message) || 0;

	    const total = currentAC + currentNet;
	    const totalEl = document.getElementById('pv-total');
	    if (totalEl) {
	        const newTotalHTML = `${formatNumber(total, 2)}<span class="unit"> kW</span>`;
	        if (totalEl.innerHTML !== newTotalHTML) {
	            totalEl.innerHTML = newTotalHTML;
	            triggerFlash(totalEl);
	        }
	    }
});

// --- 4. UI Funktionen ---
function initThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    if (!btn) return;

    const icon = btn.querySelector('i');
    
    // 1. Gespeicherten Wert oder System-Standard beim Laden auslesen
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        html.setAttribute('data-theme', 'dark');
        if (icon) icon.classList.replace('fa-moon', 'fa-sun');
    } else {
        html.setAttribute('data-theme', 'light');
        if (icon) icon.classList.replace('fa-sun', 'fa-moon');
    }

    // 2. Klick-Event für das Umschalten
    btn.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next); // Im lokalen Speicher sichern
        
        // Icon wechseln
        if (icon) {
            if (next === 'dark') {
                icon.classList.replace('fa-moon', 'fa-sun');
            } else {
                icon.classList.replace('fa-sun', 'fa-moon');
            }
        }

        // Chart-Farben anpassen
        if(pvChart) {
            const newColor = getComputedStyle(document.documentElement).getPropertyValue('--pico-color').trim();
            pvChart.options.color = newColor;
            pvChart.options.scales.x.ticks.color = newColor;
            pvChart.options.scales.y.ticks.color = newColor;
            pvChart.update();
        }
    });
}

function initCookieBanner() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;
    if (!localStorage.getItem('cookieConsent')) banner.style.display = 'block';
    document.getElementById('accept-cookies').addEventListener('click', () => {
        localStorage.setItem('cookieConsent', 'true');
        banner.style.display = 'none';
    });
}

window.onload = () => {
    initThemeToggle();
    initCookieBanner();
    initChart();
};