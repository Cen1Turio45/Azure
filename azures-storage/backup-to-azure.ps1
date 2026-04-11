param(
  [string]$ConfigPath = "C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json",
  [string]$TenantId,
  [string]$ClientId,
  [string]$ClientSecret
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

$projectName = [string]$config.projectName
$sourceFolder = [string]$config.sourceFolder
$storageAccountName = [string]$config.storageAccountName
$containerName = [string]$config.containerName
$backupBlobPrefix = [string]$config.backupBlobPrefix
$statusContainerName = [string]$config.statusContainerName
$currentStatusBlobName = [string]$config.currentStatusBlobName
$statusHistorySlots = [int]$config.statusHistorySlots
$maxAttempts = [int]$config.maxAttempts
$tenantEnvVar = [string]$config.tenantIdEnvironmentVariable
$clientIdEnvVar = [string]$config.clientIdEnvironmentVariable
$clientSecretEnvVar = [string]$config.clientSecretEnvironmentVariable
$logFolder = [string]$config.logFolder
$stateFolder = [string]$config.stateFolder

if (-not (Test-Path -LiteralPath $sourceFolder)) {
  throw "Source folder not found: $sourceFolder"
}

foreach ($folder in @($logFolder, $stateFolder)) {
  if (-not (Test-Path -LiteralPath $folder)) {
    New-Item -ItemType Directory -Path $folder | Out-Null
  }
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logPath = Join-Path $logFolder "backup-$timestamp.log"
$statePath = Join-Path $stateFolder "backup-state.json"

function Write-Log {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logPath -Append
}

function Get-AzExecutable {
  $azCommand = Get-Command az -ErrorAction SilentlyContinue

  if ($null -ne $azCommand) {
    return $azCommand.Source
  }

  $defaultAzPath = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
  if (Test-Path $defaultAzPath) {
    return $defaultAzPath
  }

  throw "Azure CLI not found."
}

function Get-RequiredSecret {
  param(
    [string]$ProvidedValue,
    [string]$EnvironmentVariableName,
    [string]$DisplayName
  )

  if (-not [string]::IsNullOrWhiteSpace($ProvidedValue)) {
    return $ProvidedValue
  }

  $value = [Environment]::GetEnvironmentVariable($EnvironmentVariableName, "User")
  if ([string]::IsNullOrWhiteSpace($value)) {
    $value = [Environment]::GetEnvironmentVariable($EnvironmentVariableName, "Process")
  }

  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Missing $DisplayName. Set $EnvironmentVariableName."
  }

  return $value
}

function Get-NextHistorySlot {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return 1
  }

  try {
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $lastSlot = [int]$state.lastHistorySlot
  } catch {
    return 1
  }

  return (($lastSlot % $statusHistorySlots) + 1)
}

function Save-HistorySlot {
  param([int]$Slot)

  $state = [ordered]@{
    lastHistorySlot = $Slot
    updatedAt = (Get-Date).ToString("o")
  }

  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
}

function New-StatusFile {
  param(
    [string]$Status,
    [int]$ProcessedFileCount,
    [string]$ErrorMessage,
    [int]$RetryCount,
    [string]$LastError
  )

  $statusPayload = [ordered]@{
    projectName = $projectName
    timestamp = (Get-Date).ToString("o")
    status = $Status
    processedFileCount = $ProcessedFileCount
    errorMessage = $ErrorMessage
    retryCount = $RetryCount
    lastError = $LastError
  }

  $statusFile = Join-Path $env:TEMP "backup-status-$([Guid]::NewGuid()).json"
  $statusPayload | ConvertTo-Json | Set-Content -LiteralPath $statusFile -Encoding utf8
  return $statusFile
}

function Upload-StatusFile {
  param(
    [string]$AzExecutable,
    [string]$StatusFile
  )

  $historySlot = Get-NextHistorySlot
  $historyBlobName = "backup-status-$historySlot.json"

  Write-Log "Uploading current status file: $currentStatusBlobName"
  & $AzExecutable storage blob upload `
    --account-name $storageAccountName `
    --container-name $statusContainerName `
    --name $currentStatusBlobName `
    --file $StatusFile `
    --overwrite true `
    --auth-mode login | Tee-Object -FilePath $logPath -Append

  if ($LASTEXITCODE -ne 0) {
    throw "Could not upload $currentStatusBlobName."
  }

  Write-Log "Uploading rotated status file: $historyBlobName"
  & $AzExecutable storage blob upload `
    --account-name $storageAccountName `
    --container-name $statusContainerName `
    --name $historyBlobName `
    --file $StatusFile `
    --overwrite true `
    --auth-mode login | Tee-Object -FilePath $logPath -Append

  if ($LASTEXITCODE -ne 0) {
    throw "Could not upload $historyBlobName."
  }

  Save-HistorySlot -Slot $historySlot
}

function Upload-BackupFiles {
  param([string]$AzExecutable)

  & $AzExecutable storage blob upload-batch `
    --destination $containerName `
    --destination-path $backupBlobPrefix `
    --account-name $storageAccountName `
    --source $sourceFolder `
    --overwrite true `
    --auth-mode login | Tee-Object -FilePath $logPath -Append

  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI upload failed with exit code $LASTEXITCODE."
  }
}

Write-Log "Backup started."
Write-Log "Project: $projectName"
Write-Log "Source folder: $sourceFolder"
Write-Log "Storage account: $storageAccountName"
Write-Log "Container: $containerName"
Write-Log "Backup blob prefix: $backupBlobPrefix"
Write-Log "Status container: $statusContainerName"

$files = Get-ChildItem -LiteralPath $sourceFolder -File -Recurse
if (($null -eq $files) -or ($files.Count -eq 0)) {
  throw "No files found in source folder."
}

$azExecutable = Get-AzExecutable
$TenantId = Get-RequiredSecret -ProvidedValue $TenantId -EnvironmentVariableName $tenantEnvVar -DisplayName "tenant id"
$ClientId = Get-RequiredSecret -ProvidedValue $ClientId -EnvironmentVariableName $clientIdEnvVar -DisplayName "client id"
$ClientSecret = Get-RequiredSecret -ProvidedValue $ClientSecret -EnvironmentVariableName $clientSecretEnvVar -DisplayName "client secret"

Write-Log "Using Azure CLI with service principal authentication."
& $azExecutable login --service-principal --username $ClientId --password $ClientSecret --tenant $TenantId | Tee-Object -FilePath $logPath -Append

if ($LASTEXITCODE -ne 0) {
  throw "Azure CLI service principal login failed with exit code $LASTEXITCODE."
}

$attempt = 0
$lastError = ""
$backupSucceeded = $false

while ($attempt -lt $maxAttempts -and -not $backupSucceeded) {
  $attempt++
  Write-Log "Backup attempt $attempt of $maxAttempts."

  try {
    Upload-BackupFiles -AzExecutable $azExecutable
    $backupSucceeded = $true
  } catch {
    $lastError = $_.Exception.Message
    Write-Log "Backup attempt $attempt failed: $lastError"

    if ($attempt -lt $maxAttempts) {
      Start-Sleep -Seconds 10
    }
  }
}

if ($backupSucceeded) {
  $statusFile = New-StatusFile `
    -Status "success" `
    -ProcessedFileCount $files.Count `
    -ErrorMessage "" `
    -RetryCount $attempt `
    -LastError $lastError
} else {
  $statusFile = New-StatusFile `
    -Status "failed" `
    -ProcessedFileCount 0 `
    -ErrorMessage "Backup failed after $maxAttempts attempts." `
    -RetryCount $attempt `
    -LastError $lastError
}

try {
  Upload-StatusFile -AzExecutable $azExecutable -StatusFile $statusFile
} finally {
  Remove-Item -LiteralPath $statusFile -Force -ErrorAction SilentlyContinue
}

if (-not $backupSucceeded) {
  throw "Backup failed after $maxAttempts attempts. Last error: $lastError"
}

Write-Log "Backup upload completed successfully."
