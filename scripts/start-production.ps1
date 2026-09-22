$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
Set-Location -LiteralPath $projectRoot
pnpm db:deploy
if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
pnpm start 2>&1 | Tee-Object -FilePath (Join-Path $projectRoot "keyforge-production.log") -Append
