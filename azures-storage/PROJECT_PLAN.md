# Projekt 2 - Automatisiertes Backup mit E-Mail-Benachrichtigung

## Ziel

Ziel dieses Projekts ist es, einen lokalen Testordner taeglich automatisiert mit Azure Storage zu sichern und die darin enthaltenen Dateien gegen versehentliches Loeschen und fehlerhaftes Ueberschreiben zu schuetzen. Als Grundlage dient ein kleiner Testordner mit zwei Textdateien. Das Projekt ist bewusst als Lernprojekt aufgebaut, soll aber so strukturiert sein, dass es spaeter erweitert und produktionsnaeher umgesetzt werden kann.

Das Backup laeuft zunaechst ausschliesslich von meinem eigenen Rechner aus. Als erfolgreich gilt das Projekt, wenn der taegliche Sicherungslauf funktioniert, bei ausgeschaltetem Rechner beim naechsten Start nachgeholt wird und eine E-Mail-Benachrichtigung ueber erfolgreiche, fehlgeschlagene oder ausbleibende Backups versendet wird. Das Budget soll unter 20 EUR bleiben.

## Architektur

Die Loesung besteht aus einem lokalen und einem Azure-basierten Teil. Lokal laeuft ein PowerShell-Skript ueber den Windows Task Scheduler. Dieses Skript liest alle Dateien aus dem Testordner, meldet sich ueber einen Service Principal bei Azure an und laedt die Dateien in Azure Blob Storage hoch.

In Azure werden die eigentlichen Backup-Dateien im Storage Account `azurestorage50t` im Container `documents` unter dem Prefix `backup-files/` abgelegt. Statusinformationen werden getrennt davon im Container `status` gespeichert. Eine Azure Function verarbeitet die Statusdatei und verschickt E-Mail-Benachrichtigungen. Ein Blob Trigger reagiert auf die aktuelle Statusdatei, ein Timer Trigger prueft regelmaessig, ob seit mehr als 72 Stunden kein Backup-Lauf mehr stattgefunden hat.

## Azure-Ressourcen

Fuer das Projekt werden diese Ressourcen genutzt oder vorbereitet:

- Resource Group fuer Projekt 2
- Storage Account `azurestorage50t`
- Container `documents`
- Blob-Prefix `backup-files/`
- Container `status`
- Azure Function App
- Function App Name: `azure-storage`
- Function Blob Trigger fuer `status/backup-status.json`
- Function Timer Trigger fuer die 72-Stunden-Pruefung
- Service Principal fuer den lokalen Upload
- Rolle `Storage Blob Data Contributor` auf dem Storage Account
- optional Application Insights fuer Function-Logs

## Backup-Umfang

Gesichert wird ein kompletter lokaler Testordner mit allen enthaltenen Dateien. Aktuell enthaelt dieser Ordner zwei Textdateien. Das Skript ist aber so aufgebaut, dass auch weitere Dateien und Unterordner mitgesichert werden koennen.

Lokale Loeschungen werden nicht automatisch in Azure nachvollzogen. Das Projekt ist ein Backup, keine Synchronisierung. Wenn eine Datei lokal geloescht wird, bleibt die bereits hochgeladene Version in Azure erhalten. Dadurch wird verhindert, dass versehentliche lokale Loeschungen direkt das Backup entfernen.

## Schutzmechanismen

Im Storage Account sind Schutzfunktionen aktiviert, damit die gespeicherten Dateien nicht nur hochgeladen, sondern auch gegen typische Fehler abgesichert werden.

- Blob-Versionierung schuetzt vor fehlerhaftem Ueberschreiben.
- Blob Soft Delete schuetzt vor versehentlichem Loeschen einzelner Dateien.
- Container Soft Delete schuetzt vor versehentlichem Loeschen ganzer Container.
- Lifecycle Management reduziert langfristig Speicherkosten.

Damit kann ein vorheriger Dateistand wiederhergestellt werden, wenn eine Datei versehentlich geaendert, ueberschrieben oder geloescht wurde.

## Backup-Erfolg

Ein Backup-Lauf gilt nur dann als erfolgreich, wenn alle Dateien des Quellordners verarbeitet wurden und anschliessend eine Statusdatei in Azure geschrieben wurde. Wenn nur ein Teil der Dateien hochgeladen werden konnte, wird der gesamte Lauf als Fehler behandelt.

Bei Fehlern fuehrt das lokale Skript maximal drei Versuche insgesamt aus. Wenn ein spaeterer Versuch erfolgreich ist, wird der Lauf als `success` dokumentiert und die Anzahl der benoetigten Versuche ueber `retryCount` gespeichert. Wenn alle Versuche fehlschlagen, wird der Lauf als `failed` dokumentiert.

Endlosschleifen werden verhindert durch:

- maximal drei Versuche insgesamt
- keine erneute Backup-Ausfuehrung durch die Azure Function
- Task Scheduler startet nur einen Lauf pro geplantem Termin

## Statusdateien

Nach jedem Backup-Lauf wird eine aktuelle Statusdatei im Container `status` geschrieben.

Aktuelle Datei:

- `backup-status.json`

Rotierende Historie:

- `backup-status-1.json`
- `backup-status-2.json`
- `backup-status-3.json`
- `backup-status-4.json`
- `backup-status-5.json`
- `backup-status-6.json`
- `backup-status-7.json`

Nach dem siebten Lauf beginnt die Rotation wieder bei `backup-status-1.json`. Die Datei `backup-status.json` enthaelt immer nur den letzten bekannten Lauf.

## JSON-Schema

Die Statusdatei enthaelt mindestens diese Felder:

```json
{
  "projectName": "Projekt 2 - Automatisiertes Backup",
  "timestamp": "2026-04-11T08:00:00+02:00",
  "status": "success",
  "processedFileCount": 2,
  "errorMessage": "",
  "retryCount": 1,
  "lastError": ""
}
```

Moegliche Statuswerte:

- `success`: vollstaendiger Backup-Lauf erfolgreich
- `failed`: Backup-Lauf fehlgeschlagen
- `warning`: seit mindestens 72 Stunden kein Backup-Lauf

`warning` wird nicht vom lokalen Backup-Skript geschrieben, sondern durch den Timer Trigger der Azure Function erzeugt.

## Benachrichtigungen

Die E-Mail-Benachrichtigung wird ueber eine Azure Function vorbereitet. Der Blob Trigger reagiert nur auf `status/backup-status.json` und verschickt sofort eine Mail, sobald ein neuer Status geschrieben wurde. Dadurch werden auch nachgeholte Laeufe direkt gemeldet.

Der Timer Trigger liest den Zeitstempel aus `backup-status.json`. Wenn seit mindestens 72 Stunden kein neuer Backup-Lauf stattgefunden hat, wird eine Warnung mit dem Hinweis `Achtung, 3 Tage kein Lauf` verschickt.

Der E-Mail-Versand wird ueber Azure Communication Services Email vorbereitet. Die Function App nutzt dafuer den Communication-Services-Connection-String, eine verifizierte Absenderadresse der verbundenen Domain und die Zieladresse des Projektbesitzers.

Die Function App verwendet zwei Storage-Verbindungen: `AzureWebJobsStorage` fuer die Function-Runtime und `BackupStorageConnection` fuer den Storage Account `azurestorage50t`, in dem der Container `status` liegt.

Die E-Mail enthaelt:

- Projektname
- Status
- Uhrzeit des Laufs
- Anzahl erfolgreich verarbeiteter Dateien
- Fehlermeldung
- Retry-Anzahl
- letzter Fehler, falls vorhanden

Empfaenger der E-Mail ist zunaechst nur der Projektbesitzer.

## Sicherheit

Das Backup verwendet keinen SAS-Token als Dauerloesung, sondern einen Service Principal. Der Service Principal bekommt nur die Berechtigungen, die fuer den Upload in Blob Storage benoetigt werden. Fuer dieses Projekt ist die Rolle `Storage Blob Data Contributor` vorgesehen.

Wichtige Sicherheitsregeln:

- keine Secrets im Code veroeffentlichen
- `Client Secret` nicht ins GitHub-Repository hochladen
- lokale Einstellungen und Logs per `.gitignore` ausschliessen
- E-Mail-Zugangsdaten nur ueber App Settings oder lokale Settings bereitstellen
- Secrets regelmaessig rotieren
- spaeter optional Azure Key Vault verwenden

## Zeitplan und Nachholverhalten

Der Windows Task Scheduler startet das lokale Backup taeglich um 08:00 Uhr. Wenn der Rechner zu diesem Zeitpunkt ausgeschaltet ist, soll die Aufgabe beim naechsten Verfuegbarwerden nachgeholt werden. Nachhollauefe werden nicht mit einem eigenen Feld markiert, sondern ueber die verspaetete Uhrzeit erkannt.

Die Azure Function startet selbst keine Backup-Laeufe. Sie wertet nur Statusdateien aus und verschickt Benachrichtigungen.

## Kostenrahmen

Das Projekt soll unter 20 EUR bleiben. Dafuer wird bewusst klein gestartet:

- nur wenige Testdateien
- guenstige Storage-Konfiguration
- keine geo-redundante Replikation
- Function App im guenstigen Verbrauchsmodell
- keine grossen Logdaten dauerhaft speichern
- Lifecycle Management fuer aeltere Daten

Die Kosten sollten regelmaessig ueber Azure Cost Management geprueft werden.

## Testplan

Diese Tests gehoeren zur Abnahme des Projekts:

- Upload der zwei Testdateien funktioniert
- neue Datei im Testordner wird beim naechsten Lauf mit hochgeladen
- geaenderte Datei wird erneut hochgeladen
- alte Version kann ueber Blob-Versionierung wiederhergestellt werden
- geloeschte Datei kann ueber Soft Delete wiederhergestellt werden
- Backup-Dateien landen unter `documents/backup-files/`
- Statusdatei landet im Container `status`
- `backup-status.json` enthaelt den letzten Lauf
- Rotation `backup-status-1.json` bis `backup-status-7.json` funktioniert
- Erfolgsmail wird nach erfolgreichem Lauf versendet
- Fehlermail wird nach fehlgeschlagenem Lauf versendet
- Retry-Logik bricht nach maximal drei Versuchen ab
- Timer Trigger erzeugt Warnung nach 72 Stunden ohne Lauf

## Testergebnisse

Bereits erfolgreich getestet:

- Upload der Testdateien nach `documents/backup-files/`
- Aktualisierung von `backup-status.json`
- Schreiben der rotierenden Statusdateien im Container `status`
- Rotation von `backup-status-7.json` zurueck auf `backup-status-1.json`
- Retry-Logik mit maximal drei Versuchen bei absichtlich falschem Zielcontainer
- Schreiben eines `failed`-Status nach drei fehlgeschlagenen Versuchen
- Wiederherstellung des aktuellen Status auf `success` nach normalem Backup-Lauf
- manueller E-Mail-Test ueber Azure Communication Services
- manueller Warnungs-Test ueber den HTTP-Endpunkt `check-warning?force=true`
- Deployment der Azure Function App `azure-storage`
- Registrierung der Trigger `backup_status_blob_trigger`, `backup_warning_timer_trigger`, `send_test_email` und `check_warning`
- Windows Scheduled Task `AzureStorageDailyBackup` ist registriert und bereit

Noch manuell zu bestaetigen:

- Eingang der automatischen Blob-Trigger-Mail nach Aktualisierung von `backup-status.json`
- Eingang der Fehler-Mail nach absichtlich fehlgeschlagenem Backup-Lauf
- Eingang der Warn-Mail beim 72-Stunden-Test

## Abnahmekriterien

Das Projekt gilt als fertig, wenn:

- der Task Scheduler taeglich um 08:00 Uhr startet
- verpasste Laeufe beim naechsten Start nachgeholt werden
- alle Dateien aus dem Testordner nach Azure hochgeladen werden
- Statusdateien korrekt geschrieben werden
- Azure Function Benachrichtigungen verschickt
- Fehler und Warnungen korrekt gemeldet werden
- Versioning und Soft Delete getestet wurden
- das Projekt unter 20 EUR bleibt

## Abgrenzung

Dieses Projekt ist kein vollstaendiges Unternehmensbackup. Es sichert keine kompletten PCs, keine E-Mails, keine Datenbanken, keine VMs und keine Microsoft-365-Umgebung. Es ist auch keine produktive Compliance- oder Disaster-Recovery-Loesung. Der Fokus liegt auf einem klar abgegrenzten Lernprojekt fuer automatisierte Datei-Backups mit Azure Storage, Statusauswertung und E-Mail-Benachrichtigung.

## Erweiterungen

Moegliche spaetere Erweiterungen:

- mehrere Quellordner
- getrennte Zielcontainer fuer unterschiedliche Datentypen
- Azure Key Vault fuer Secrets
- Microsoft Graph oder Azure Communication Services fuer E-Mail
- Application Insights Monitoring
- Dashboard fuer Backup-Historie
- Azure Monitor Alerts
- Infrastructure as Code fuer Function App und App Settings
- produktionsnaeheres Rollen- und Berechtigungskonzept
