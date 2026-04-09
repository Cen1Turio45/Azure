param(
  [string]$ConfigPath = "C:\Users\lucas\OneDrive\Desktop\Azure\azure-storage\backup-settings.json",
  [string]$SasToken,
  [string]$TenantId,
  [string]$ClientId,
  [string]$ClientSecret,
  [switch]$UseAzCli
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Config file not found: $ConfigPath"
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json

$sourceFolder = [string]$config.sourceFolder
$storageAccountName = [string]$config.storageAccountName
$containerName = [string]$config.containerName
$authMode = [string]$config.authMode
$sasEnvVar = [string]$config.sasTokenEnvironmentVariable
$tenantEnvVar = [string]$config.tenantIdEnvironmentVariable
$clientIdEnvVar = [string]$config.clientIdEnvironmentVariable
$clientSecretEnvVar = [string]$config.clientSecretEnvironmentVariable
$logFolder = [string]$config.logFolder

if (-not (Test-Path -LiteralPath $sourceFolder)) {
  throw "Source folder not found: $sourceFolder"
}

if (-not (Test-Path -LiteralPath $logFolder)) {
  New-Item -ItemType Directory -Path $logFolder | Out-Null
}

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$logPath = Join-Path $logFolder "backup-$timestamp.log"

function Write-Log {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logPath -Append
}

Write-Log "Backup started."
Write-Log "Source folder: $sourceFolder"
Write-Log "Storage account: $storageAccountName"
Write-Log "Container: $containerName"

$files = Get-ChildItem -LiteralPath $sourceFolder -File -Recurse

if (($null -eq $files) -or ($files.Count -eq 0)) {
  Write-Log "No files found. Nothing to upload."
  exit 0
}

if ($UseAzCli -or $authMode -eq "azcli" -or $authMode -eq "servicePrincipal") {
  $azCommand = Get-Command az -ErrorAction SilentlyContinue
  $azExecutable = $null

  if ($null -ne $azCommand) {
    $azExecutable = $azCommand.Source
  } elseif (Test-Path "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd") {
    $azExecutable = "C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd"
  }

  if ([string]::IsNullOrWhiteSpace($azExecutable)) {
    throw "Azure CLI not found. Install Azure CLI or switch authMode."
  }

  if ($authMode -eq "servicePrincipal") {
    if ([string]::IsNullOrWhiteSpace($TenantId)) {
      $TenantId = [Environment]::GetEnvironmentVariable($tenantEnvVar, "User")
    }
    if ([string]::IsNullOrWhiteSpace($TenantId)) {
      $TenantId = [Environment]::GetEnvironmentVariable($tenantEnvVar, "Process")
    }
    if ([string]::IsNullOrWhiteSpace($ClientId)) {
      $ClientId = [Environment]::GetEnvironmentVariable($clientIdEnvVar, "User")
    }
    if ([string]::IsNullOrWhiteSpace($ClientId)) {
      $ClientId = [Environment]::GetEnvironmentVariable($clientIdEnvVar, "Process")
    }
    if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
      $ClientSecret = [Environment]::GetEnvironmentVariable($clientSecretEnvVar, "User")
    }
    if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
      $ClientSecret = [Environment]::GetEnvironmentVariable($clientSecretEnvVar, "Process")
    }

    if ([string]::IsNullOrWhiteSpace($TenantId) -or [string]::IsNullOrWhiteSpace($ClientId) -or [string]::IsNullOrWhiteSpace($ClientSecret)) {
      throw "Missing service principal credentials. Set tenant, client id and client secret."
    }

    Write-Log "Using Azure CLI with service principal authentication."
    & $azExecutable login --service-principal --username $ClientId --password $ClientSecret --tenant $TenantId | Tee-Object -FilePath $logPath -Append

    if ($LASTEXITCODE -ne 0) {
      throw "Azure CLI service principal login failed with exit code $LASTEXITCODE."
    }
  } else {
    Write-Log "Using Azure CLI with interactive login context."
  }

  & $azExecutable storage blob upload-batch `
    --destination $containerName `
    --account-name $storageAccountName `
    --source $sourceFolder `
    --overwrite true `
    --auth-mode login | Tee-Object -FilePath $logPath -Append

  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI upload failed with exit code $LASTEXITCODE."
  }

  Write-Log "Backup upload completed successfully."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($SasToken)) {
  $SasToken = [Environment]::GetEnvironmentVariable($sasEnvVar, "User")
}

if ([string]::IsNullOrWhiteSpace($SasToken)) {
  $SasToken = [Environment]::GetEnvironmentVariable($sasEnvVar, "Process")
}

if ([string]::IsNullOrWhiteSpace($SasToken)) {
  throw "No SAS token provided. Set $sasEnvVar or pass -SasToken."
}

if ($SasToken.StartsWith("?")) {
  $SasToken = $SasToken.Substring(1)
}

$apiVersion = "2023-11-03"
$storageBaseUrl = "https://$storageAccountName.blob.core.windows.net"

foreach ($file in $files) {
  $relativePath = $file.FullName.Substring($sourceFolder.Length).TrimStart("\")
  $blobName = ($relativePath -replace "\\", "/")
  $blobUrl = "$storageBaseUrl/$containerName/$blobName`?$SasToken"

  $headers = @{
    "x-ms-blob-type" = "BlockBlob"
    "x-ms-version"   = $apiVersion
  }

  Invoke-RestMethod `
    -Uri $blobUrl `
    -Method Put `
    -Headers $headers `
    -InFile $file.FullName `
    -ContentType "application/octet-stream"

  Write-Log "Uploaded: $blobName"
}

Write-Log "Backup upload completed successfully."
