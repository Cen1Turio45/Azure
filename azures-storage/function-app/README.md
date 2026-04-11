# Azure Function App - Backup Notifications

Diese Function App verschickt E-Mail-Benachrichtigungen fuer Projekt 2.

Azure-Ziel:

- Function App: `azure-storage`
- Resource Group: `azurestorage50t`

## Funktionen

- `backup_status_blob_trigger`
  Reagiert auf `status/backup-status.json` und sendet sofort eine E-Mail mit dem Backup-Status.

- `backup_warning_timer_trigger`
  Prueft taeglich um 08:00 Uhr den Zeitstempel aus `backup-status.json`. Wenn seit mindestens 72 Stunden kein Backup-Lauf stattgefunden hat, wird eine Warnung verschickt.

- `send_test_email`
  Manueller HTTP-Test fuer den E-Mail-Versand.

- `check_warning`
  Manueller HTTP-Test fuer die 72-Stunden-Warnung. Mit `force=true` kann eine Warn-Mail ohne Wartezeit getestet werden.

## Benoetigte App Settings

- `AzureWebJobsStorage`
- `BackupStorageConnection`
- `PROJECT_NAME`
- `STATUS_CONTAINER_NAME`
- `CURRENT_STATUS_BLOB_NAME`
- `WARNING_THRESHOLD_HOURS`
- `COMMUNICATION_SERVICES_CONNECTION_STRING`
- `ACS_EMAIL_SENDER`
- `MAIL_TO`
- `WEBSITE_TIME_ZONE`

## Zeitplan

Der Timer verwendet:

```text
0 0 8 * * *
```

Damit die Uhrzeit in Deutschland als 08:00 Uhr interpretiert wird, sollte in der Azure Function App zusaetzlich dieses App Setting gesetzt werden:

```text
WEBSITE_TIME_ZONE=W. Europe Standard Time
```

## Lokaler Test

Kopiere `local.settings.example.json` zu `local.settings.json` und trage die echten Werte ein.

Dann:

```powershell
func start
```

## Naechster Schritt

Die Function App muss in Azure mit den App Settings konfiguriert und danach veroeffentlicht werden.

## Deployment aus VS Code / Terminal

Wenn die App Settings in Azure gesetzt sind:

```powershell
.\deploy-function-app.ps1
```

Die Datei `app-settings.sample.json` zeigt, welche Einstellungen du brauchst. Die Werte `BackupStorageConnection` und `COMMUNICATION_SERVICES_CONNECTION_STRING` sind Secrets und sollten nur als Azure App Settings gespeichert werden.

Wichtig: `AzureWebJobsStorage` ist der Runtime-Storage der Function App. `BackupStorageConnection` muss auf den Storage Account `azurestorage50t` zeigen, weil dort der Container `status` liegt.

## App Settings setzen

Nutze dafuer:

```powershell
.\configure-function-app-settings.ps1 `
  -ResourceGroupName "<RESOURCE_GROUP>" `
  -BackupStorageConnection "<AZURESTORAGE50T_CONNECTION_STRING>" `
  -CommunicationServicesConnectionString "<ACS_CONNECTION_STRING>" `
  -AcsEmailSender "<ABSENDER_ADRESSE>" `
  -MailTo "<DEINE_EMAIL>"
```
