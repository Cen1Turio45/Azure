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

## 4. Logic App ergaenzen

Ziel:

- jeden Morgen eine Status-Mail senden
- Empfaenger: Administrator oder Geschaeftsfuehrer
- Inhalt:
  - Projektname
  - Datum/Uhrzeit
  - kurzer Statustext
  - Hinweis auf Storage-Schutzfunktionen

Einfachster Ablauf in Logic Apps:

1. `Recurrence` Trigger jeden Morgen
2. optional `Compose` fuer den Mailtext
3. `Send an email (V2)` ueber Outlook

## 5. Azure Backup richtig verwenden

Azure Backup sollte in diesem Projekt als Erweiterung sauber eingeordnet werden:

- sinnvoll fuer `Virtual Machines`
- sinnvoll fuer `Azure Files`
- sinnvoll fuer definierte klassische Backup-Richtlinien
- nicht der primaere Ersatz fuer Blob-Versionierung und Soft Delete

## 6. Portfolio-Formulierung

Eine passende Kurzbeschreibung waere:

`In diesem Projekt wurde ein Azure-Storage-basiertes Backup- und Restore-Konzept aufgebaut. Dabei wurden Blob-Versionierung, Soft Delete und Lifecycle Management eingesetzt, um Daten gegen Loeschen und Ueberschreiben zu schuetzen und Speicherkosten langfristig zu senken. Das Projekt wurde so vorbereitet, dass es um geo-redundante Replikation, Azure Backup und automatisierte Statusmeldungen per Logic Apps erweitert werden kann.`
