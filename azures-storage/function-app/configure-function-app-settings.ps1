param(
  [string]$ResourceGroupName,
  [string]$FunctionAppName = "azure-storage",
  [string]$BackupStorageConnection,
  [string]$CommunicationServicesConnectionString,
  [string]$AcsEmailSender,
  [string]$MailTo
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ResourceGroupName)) {
  throw "ResourceGroupName is required."
}

if ([string]::IsNullOrWhiteSpace($BackupStorageConnection)) {
  throw "BackupStorageConnection is required."
}

if ([string]::IsNullOrWhiteSpace($CommunicationServicesConnectionString)) {
  throw "CommunicationServicesConnectionString is required."
}

if ([string]::IsNullOrWhiteSpace($AcsEmailSender)) {
  throw "AcsEmailSender is required."
}

if ([string]::IsNullOrWhiteSpace($MailTo)) {
  throw "MailTo is required."
}

$azCommand = Get-Command az -ErrorAction SilentlyContinue
$azExecutable = $null

if ($null -ne $azCommand) {
  $azExecutable = $azCommand.Source
} elseif (Test-Path "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd") {
  $azExecutable = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
}

if ([string]::IsNullOrWhiteSpace($azExecutable)) {
  throw "Azure CLI not found."
}

& $azExecutable functionapp config appsettings set `
  --resource-group $ResourceGroupName `
  --name $FunctionAppName `
  --settings `
    "PROJECT_NAME=Projekt 2 - Automatisiertes Backup" `
    "STATUS_CONTAINER_NAME=status" `
    "CURRENT_STATUS_BLOB_NAME=backup-status.json" `
    "WARNING_THRESHOLD_HOURS=72" `
    "WEBSITE_TIME_ZONE=W. Europe Standard Time" `
    "BackupStorageConnection=$BackupStorageConnection" `
    "COMMUNICATION_SERVICES_CONNECTION_STRING=$CommunicationServicesConnectionString" `
    "ACS_EMAIL_SENDER=$AcsEmailSender" `
    "MAIL_TO=$MailTo"

if ($LASTEXITCODE -ne 0) {
  throw "Could not configure Function App settings."
}

Write-Host "Function App settings configured successfully."
