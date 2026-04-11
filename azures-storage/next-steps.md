# Next Steps

## 1. Container-Struktur vervollstaendigen

Lege diese Container an:

- `app-data`
- `configs`
- `archive`

Damit wird klar zwischen Dokumenten, Anwendungsdaten, Konfigurationen und Archivdaten unterschieden.

## 2. Replikation fachlich richtig einordnen

Aktuell ist fuer das Lernprojekt `LRS` voellig okay. Wenn du jedoch die Aussage treffen willst, dass Daten ueber mehrere physische Rechenzentren oder Regionen abgesichert sind, musst du die Replikationsart bewusst aendern.

Geeignete Optionen:

- `ZRS`: Schutz ueber mehrere Verfuegbarkeitszonen in einer Region
- `GRS`: Replikation in eine zweite Region
- `RA-GRS`: wie GRS, zusaetzlich Lesezugriff auf die Sekundaerregion
- `GZRS`: Zonen + zweite Region

## 3. Lifecycle als Projektartefakt dokumentieren

Die Portal-Regel sollte auch als Datei dokumentiert sein. Dafuer ist `lifecycle-policy.json` im Projekt abgelegt.

## 4. Azure Function konfigurieren

Ziel:

- bei jeder neuen `backup-status.json` eine Status-Mail senden
- taeglich um 08:00 Uhr die 72-Stunden-Warnung pruefen
- Empfaenger: Projektbesitzer
- Inhalt:
  - Projektname
  - Status
  - Datum und Uhrzeit
  - verarbeitete Dateien
  - Fehlermeldung
  - Retry-Anzahl

Umsetzung:

1. Blob Trigger fuer `status/backup-status.json`
2. Timer Trigger fuer die 72-Stunden-Pruefung
3. SMTP-App-Settings fuer den E-Mail-Versand

## 4a. Statusdateien ergaenzen

Als naechster technischer Schritt schreibt das Backup-Skript nach jedem Lauf eine aktuelle Statusdatei in den Container `status`.

Geplante Dateien:

- `backup-status.json`
- `backup-status-1.json`
- `backup-status-2.json`
- `backup-status-3.json`
- `backup-status-4.json`
- `backup-status-5.json`
- `backup-status-6.json`
- `backup-status-7.json`

Die Datei `backup-status.json` enthaelt immer den letzten Lauf. Die sieben nummerierten Dateien bilden eine feste Rotation.

## 5. Azure Backup richtig verwenden

Azure Backup sollte in diesem Projekt als Erweiterung sauber eingeordnet werden:

- sinnvoll fuer `Virtual Machines`
- sinnvoll fuer `Azure Files`
- sinnvoll fuer definierte klassische Backup-Richtlinien
- nicht der primaere Ersatz fuer Blob-Versionierung und Soft Delete

## 6. Portfolio-Formulierung

Eine passende Kurzbeschreibung waere:

`In diesem Projekt wurde ein automatisiertes Backup eines lokalen Testordners nach Azure Blob Storage aufgebaut. Dabei wurden Blob-Versionierung, Soft Delete, Lifecycle Management, Service-Principal-Authentifizierung und Azure Functions eingesetzt, um Dateien zu sichern, Statusmeldungen auszuwerten und E-Mail-Benachrichtigungen bei Erfolg, Fehler oder ausbleibenden Laeufen zu versenden.`
