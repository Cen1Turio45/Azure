param(
  [string]$TaskName = "AzureStorageDailyBackup",
  [string]$ScriptPath = "C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-to-azure.ps1",
  [string]$ConfigPath = "C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json",
  [string]$RunTime = "08:00"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "Backup script not found: $ScriptPath"
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`" -ConfigPath `"$ConfigPath`""

$trigger = New-ScheduledTaskTrigger -Daily -At $RunTime
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Uploads selected files daily to Azure Blob Storage." `
  -Force | Out-Null

Write-Host "Scheduled task '$TaskName' created for $RunTime."
