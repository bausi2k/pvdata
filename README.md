# PV-Dashboard Sonnenblumenweg

Dieses Dashboard visualisiert die Leistungs- und Energiedaten einer Photovoltaik-Anlage in Echtzeit. Die Daten werden über einen MQTT-Broker empfangen und mit modernem Web-Design sowie interaktiven Grafiken dargestellt.

## Features

* **Live-Monitoring**: Anzeige von DC-Leistung, AC-Leistung, aktueller Netzleistung und Tagesproduktion.
* **Berechnete Akkuleistung**: Automatische Differenzberechnung (`DC-Leistung - AC-Leistung`) zur Visualisierung des Energieflusses in oder aus dem Speicher.
* **Interaktiver Verlauf**: Ein Live-Liniendiagramm zeigt die Leistungsdaten der letzten Minuten an.
* **Energie-Statistiken**: Übersicht der Erträge für die aktuelle Woche, den Monat und das Jahr.
* **Status-Anzeige**: Überprüfung des Wechselrichter-Status (String-basiert) und der MQTT-Verbindung.
* **Responsive Design**: Optimierte Darstellung für Smartphones, Tablets und Desktop-PCs dank Pico CSS.

## Projektstruktur

Das Projekt ist in saubere Module unterteilt, um die Wartung zu erleichtern:

* `index.html`: Das HTML5-Gerüst und das Layout der Anwendung.
* `style.css`: Beinhaltet das gesamte Design, die Farbschemata und die responsiven Layout-Regeln.
* `app.js`: Die Programmlogik zur MQTT-Kommunikation, Datenverarbeitung und Chart-Aktualisierung.
* `impressum.html`: Rechtlich notwendige Informationen über den Medieninhaber.
* `cookies.html`: Information über technisch notwendigen lokalen Speicher (`cookieConsent`).

## Installation & Setup

Da das Dashboard rein auf Web-Technologien (HTML/JS) basiert, ist keine serverseitige Installation erforderlich.

1.  **Dateien hochladen**: Kopiere alle Dateien in ein Verzeichnis auf deinem Webserver oder nutze Cloudflare Pages.
2.  **MQTT-Konfiguration**: Die Zugangsdaten zum HiveMQ-Broker sind in der `app.js` hinterlegt.
3.  **Browser öffnen**: Rufe die `index.html` auf.

## Technische Details

* **Framework**: [Pico CSS](https://picocss.com/) (v2)
* **Grafiken**: [Chart.js](https://www.chartjs.org/)
* **Protokoll**: MQTT über WebSockets (mqtt.js)
* **Hosting**: Cloudflare Pages (empfohlen)

## Lizenz

[cite_start]Dieses Programm ist freie Software: Sie können es unter den Bedingungen der **GNU General Public License**, wie von der Free Software Foundation veröffentlicht, weiterverteilen und/oder modifizieren[cite: 157]. [cite_start]Die Software wird ohne jegliche Gewährleistung verbreitet[cite: 158].

---
*Erstellt mit ❤️ für die Bewohner im Sonnenblumenweg.*