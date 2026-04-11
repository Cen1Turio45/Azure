param(
  [string]$FunctionAppName = "azure-storage"
)

$ErrorActionPreference = "Stop"

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

$funcCommand = Get-Command func -ErrorAction SilentlyContinue
if ($null -eq $funcCommand) {
  throw "Azure Functions Core Tools not found."
}

Write-Host "Publishing function app '$FunctionAppName'..."
func azure functionapp publish $FunctionAppName

Write-Host "Publish command completed."
Write-Host "Remember to set these app settings in Azure:"
Write-Host "- AzureWebJobsStorage"
Write-Host "- BackupStorageConnection"
Write-Host "- COMMUNICATION_SERVICES_CONNECTION_STRING"
Write-Host "- ACS_EMAIL_SENDER"
Write-Host "- MAIL_TO"
Write-Host "- WEBSITE_TIME_ZONE=W. Europe Standard Time"
