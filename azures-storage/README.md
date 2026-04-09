# Azure Storage Project

Dieses Projekt baut eine kleine, praxisnahe Backup- und Restore-Basis in Azure auf.

## Projektziel

Wichtige Unternehmensdaten sollen in Azure Blob Storage getrennt gespeichert, gegen Loeschen und Ueberschreiben geschuetzt und spaeter guenstiger abgelegt werden. Zusaetzlich wird das Projekt so vorbereitet, dass es um Logic Apps und Azure Backup erweitert werden kann.

## Aktueller Stand

Bereits umgesetzt und getestet:

- `Storage Account` erstellt
- Container `documents` erstellt
- `Versionsverwaltung fuer Blobs` aktiviert
- `Vorlaeufiges Loeschen fuer Blobs` aktiviert
- `Vorlaeufiges Loeschen fuer Container` aktiviert
- Ueberschreiben einer Datei getestet
- Wiederherstellung einer alten Version getestet
- Loeschen einer Datei getestet
- Wiederherstellung per Soft Delete getestet
- erste Lifecycle-Regel im Portal angelegt

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

## Naechster sinnvoller Ausbau

- weitere Container `app-data`, `configs`, `archive` anlegen
- Replikationsart bewusst pruefen und ggf. auf `GRS` oder `GZRS` umstellen
- Lifecycle-Regel als Datei dokumentieren
- lokalen taeglichen Upload bestimmter Dateien nach Azure automatisieren
- Azure-Authentifizierung ohne SAS ueber Service Principal einrichten
- danach Logic App fuer taegliche Status-Mail aufbauen
- Azure Backup als Erweiterung fuer geeignete Workloads einordnen
