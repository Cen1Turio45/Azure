param(
  [string]$TenantId,
  [string]$ClientId,
  [string]$ClientSecret
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($TenantId)) {
  $TenantId = Read-Host "Azure Tenant ID"
}

if ([string]::IsNullOrWhiteSpace($ClientId)) {
  $ClientId = Read-Host "Azure Client ID"
}

if ([string]::IsNullOrWhiteSpace($ClientSecret)) {
  $secureSecret = Read-Host "Azure Client Secret" -AsSecureString
  $ClientSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
  )
}

if ([string]::IsNullOrWhiteSpace($TenantId) -or [string]::IsNullOrWhiteSpace($ClientId) -or [string]::IsNullOrWhiteSpace($ClientSecret)) {
  throw "Tenant ID, Client ID and Client Secret are required."
}

[Environment]::SetEnvironmentVariable("AZURE_TENANT_ID", $TenantId, "User")
[Environment]::SetEnvironmentVariable("AZURE_CLIENT_ID", $ClientId, "User")
[Environment]::SetEnvironmentVariable("AZURE_CLIENT_SECRET", $ClientSecret, "User")

Write-Host "Azure authentication variables have been saved for the current user."
Write-Host "Close and reopen VS Code or your terminal before running the backup script."
