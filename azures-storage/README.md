# Azure Storage Project

Dieses Projekt baut eine kleine, praxisnahe Backup- und Restore-Basis in Azure auf.

Die ausfuehrliche Projektplanung liegt in [PROJECT_PLAN.md](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\PROJECT_PLAN.md).

## Projektziel

Ein lokaler Testordner wird taeglich automatisiert nach Azure Blob Storage gesichert. Die Dateien werden gegen Loeschen und Ueberschreiben geschuetzt. Zusaetzlich wird eine Azure Function fuer E-Mail-Benachrichtigungen bei Erfolg, Fehler und ausbleibenden Laeufen vorbereitet.

## Aktueller Stand

Bereits umgesetzt und getestet:

- `Storage Account` erstellt
- Container `documents` erstellt
- Container `status` erstellt
- Backup-Dateien werden unter `documents/backup-files/` abgelegt
- `Versionsverwaltung fuer Blobs` aktiviert
- `Vorlaeufiges Loeschen fuer Blobs` aktiviert
- `Vorlaeufiges Loeschen fuer Container` aktiviert
- Ueberschreiben einer Datei getestet
- Wiederherstellung einer alten Version getestet
- Loeschen einer Datei getestet
- Wiederherstellung per Soft Delete getestet
- erste Lifecycle-Regel im Portal angelegt
- Azure Function App `azure-storage` deployed
- HTTP-Testmail erfolgreich ueber Azure Communication Services versendet
- Statusdateien werden in den Container `status` geschrieben
- 7er-Rotation der Statusdateien wurde getestet
- Fehlerfall mit maximal drei Versuchen wurde getestet

## Wichtige fachliche Einordnung

- `LRS` ist gut fuer den guenstigen Einstieg, repliziert aber nicht ueber mehrere Rechenzentren.
- Wenn Daten auch bei einem Ausfall eines gesamten Rechenzentrums oder einer Region verfuegbar bleiben sollen, brauchst du je nach Ziel mindestens `GRS`, `RA-GRS`, `GZRS` oder `RA-GZRS`.
- `Versioning` schuetzt vor Ueberschreiben.
- `Soft Delete` schuetzt vor versehentlichem Loeschen.
- `Lifecycle Management` hilft bei der Kostenoptimierung.
- `Azure Backup` ist eher fuer klassische Backup-Szenarien wie VMs, Azure Files oder definierte Restore-Policies relevant, nicht als Ersatz fuer Blob-Versionierung.

## Projektdateien

- [main.bicep](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\main.bicep)
- [lifecycle-policy.json](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\lifecycle-policy.json)
- [next-steps.md](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\next-steps.md)
- [backup-to-azure.ps1](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-to-azure.ps1)
- [backup-settings.json](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json)
- [register-backup-task.ps1](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\register-backup-task.ps1)
- [AUTOMATION.md](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\AUTOMATION.md)
- [function-app](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\function-app)

## Naechster sinnvoller Ausbau

- weitere Container `app-data`, `configs`, `archive` anlegen
- Replikationsart bewusst pruefen und ggf. auf `GRS` oder `GZRS` umstellen
- Lifecycle-Regel als Datei dokumentieren
- lokalen taeglichen Upload bestimmter Dateien nach Azure automatisieren
- Azure-Authentifizierung ohne SAS ueber Service Principal einrichten
- Statusdateien im Container `status` erzeugen
- Azure Function fuer E-Mail-Benachrichtigungen konfigurieren
- Azure Backup als Erweiterung fuer geeignete Workloads einordnen
