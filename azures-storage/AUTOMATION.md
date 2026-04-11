# Automated Upload To Azure Blob Storage

Dieses Setup erstellt ein kleines vollautomatisiertes Backup fuer ausgewaehlte Dateien.

## Quelle

- [Test](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\Test)

## Ziel

- Storage Account: `azurestorage50t`
- Container: `documents`
- Backup-Prefix: `backup-files/`
- Status-Container: `status`

## Projektdateien

- [backup-settings.json](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json)
- [backup-to-azure.ps1](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-to-azure.ps1)
- [register-backup-task.ps1](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\register-backup-task.ps1)

## Authentifizierungswege

Es gibt drei moegliche Modi:

- `sas`
  Gut fuer einen schnellen, stabilen Start
- `azcli`
  Gut, wenn du die Azure CLI sauber mit deinem Konto nutzen willst
- `servicePrincipal`
  Gut fuer taegliche automatische Laeufe ohne SAS und ohne interaktiven Login

Den Modus stellst du in [backup-settings.json](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json) ueber `authMode` ein.

## Empfohlener Azure-Weg ohne SAS: Service Principal

Lege in Microsoft Entra ID eine App-Registrierung oder einen Service Principal an und gib ihm auf dem Storage Account mindestens die Rolle:

- `Storage Blob Data Contributor`

Setze dann diese Benutzervariablen auf deinem Rechner:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

Danach testest du:

```powershell
.\backup-to-azure.ps1
```

Der Login erfolgt dann ueber die Azure CLI automatisch per Service Principal.

## Alternative: SAS

Erstelle im Container `documents` einen `SAS`-Link mit mindestens:

- `Read`
- `Write`
- `Create`
- optional `List`

Lege das Token dann als Benutzervariable `AZURE_STORAGE_SAS_TOKEN` an oder uebergib es direkt an das Skript.

## Lokaler Test

```powershell
$env:AZURE_STORAGE_SAS_TOKEN = "<DEIN_SAS_TOKEN>"
.\backup-to-azure.ps1
```

## Azure-CLI-Modus

Wenn `az login` bei dir sauber funktioniert, stelle in [backup-settings.json](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json) ein:

```json
"authMode": "azcli"
```

Dann testest du:

```powershell
az login
.\backup-to-azure.ps1 -UseAzCli
```

## Tägliche Automatisierung

Die tägliche Windows-Aufgabe kannst du direkt per Skript anlegen:

```powershell
.\register-backup-task.ps1
```

Optional mit anderer Uhrzeit:

```powershell
.\register-backup-task.ps1 -RunTime "07:30"
```

## Was das jetzt leistet

- täglicher Upload aller Dateien aus dem Testordner
- Ablage der Backup-Dateien unter `documents/backup-files/`
- Unterordner werden mit uebernommen
- Logdateien werden lokal gespeichert
- ein Scheduler kann automatisch eingerichtet werden

## Logdateien

Die Logs landen unter:

- `C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\logs`

## Nächster Ausbau

- mehrere Quellordner
- Upload in mehrere Container
- tägliche Status-Mail
- Fehlerpfad mit Benachrichtigung

## Azure Function App

Die Function App liegt unter:

- [function-app](C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\function-app)

Sie enthaelt:

- Blob Trigger fuer `status/backup-status.json`
- Timer Trigger fuer die 72-Stunden-Warnung
- SMTP-basierten E-Mail-Versand ueber App Settings
