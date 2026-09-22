param(
  [Parameter(Mandatory = $true)][string]$DatabaseBackup,
  [string]$FilesArchive,
  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore replaces the target database. Re-run with -ConfirmRestore after verifying the target and backup." }
$databaseFile = [System.IO.Path]::GetFullPath($DatabaseBackup)
if (-not (Test-Path -LiteralPath $databaseFile -PathType Leaf)) { throw "The database backup does not exist." }
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if (-not $env:DATABASE_URL) {
  $envLine = Get-Content -LiteralPath (Join-Path $projectRoot ".env") | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $envLine) { throw "DATABASE_URL is not configured." }
  $env:DATABASE_URL = ($envLine -replace '^DATABASE_URL=', '').Trim('"')
}

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
  $pgRestore = Get-ChildItem -LiteralPath "C:\Program Files\PostgreSQL" -Filter pg_restore.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
}
if (-not $pgRestore) { throw "pg_restore was not found. Install PostgreSQL client tools or add them to PATH." }
$pgRestorePath = if ($pgRestore.Source) { $pgRestore.Source } else { $pgRestore.FullName }

Write-Output "Restoring the explicitly configured DATABASE_URL target. All existing Keyforge database objects in that target will be replaced."
$databaseUrlForPg = $env:DATABASE_URL -replace '([?&])schema=[^&]*&', '$1' -replace '([?&])schema=[^&]*$', ''
& $pgRestorePath --dbname=$databaseUrlForPg --clean --if-exists --no-owner --exit-on-error $databaseFile
if ($LASTEXITCODE -ne 0) { throw "pg_restore failed with exit code $LASTEXITCODE." }

if ($FilesArchive) {
  $archive = [System.IO.Path]::GetFullPath($FilesArchive)
  if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "The files archive does not exist." }
  $storageDirectory = if ($env:KEYFORGE_STORAGE_DIR) { [System.IO.Path]::GetFullPath($env:KEYFORGE_STORAGE_DIR) } else { [System.IO.Path]::GetFullPath((Join-Path $projectRoot "data\files")) }
  $driveRoot = [System.IO.Path]::GetPathRoot($storageDirectory)
  $userProfile = [System.IO.Path]::GetFullPath([Environment]::GetFolderPath("UserProfile"))
  if ($storageDirectory -eq $driveRoot -or $storageDirectory -eq $projectRoot -or $storageDirectory -eq $userProfile) {
    throw "Refusing to replace files in an unsafe storage directory: $storageDirectory"
  }
  New-Item -ItemType Directory -Force -Path $storageDirectory | Out-Null
  Get-ChildItem -LiteralPath $storageDirectory -Force | Remove-Item -Recurse -Force
  Expand-Archive -LiteralPath $archive -DestinationPath $storageDirectory -Force
}
Write-Output "Restore completed. Run pnpm db:deploy before starting Keyforge."
