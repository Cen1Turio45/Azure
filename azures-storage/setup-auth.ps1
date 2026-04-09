param()

$ErrorActionPreference = "Stop"

$TenantId = "<AZURE_TENANT_ID>"
$ClientId = "<AZURE_CLIENT_ID>"
$ClientSecret = "<AZURE_CLIENT_SECRET>"

if ($TenantId -like "<*" -or $ClientId -like "<*" -or $ClientSecret -like "<*") {
  throw "Replace the placeholder values with your real Azure tenant, client, and client secret values before running this script."
}

[Environment]::SetEnvironmentVariable("AZURE_TENANT_ID", $TenantId, "User")
[Environment]::SetEnvironmentVariable("AZURE_CLIENT_ID", $ClientId, "User")
[Environment]::SetEnvironmentVariable("AZURE_CLIENT_SECRET", $ClientSecret, "User")

Write-Host "Azure authentication variables have been saved for the current user."
Write-Host "Close and reopen VS Code or your terminal before running the backup script."
