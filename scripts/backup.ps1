param(
  [string]$BackupDirectory = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$backupRoot = [System.IO.Path]::GetFullPath($BackupDirectory)
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

if (-not $env:DATABASE_URL) {
  $envLine = Get-Content -LiteralPath (Join-Path $projectRoot ".env") | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if (-not $envLine) { throw "DATABASE_URL is not configured." }
  $env:DATABASE_URL = ($envLine -replace '^DATABASE_URL=', '').Trim('"')
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
  $pgDump = Get-ChildItem -LiteralPath "C:\Program Files\PostgreSQL" -Filter pg_dump.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
}
if (-not $pgDump) { throw "pg_dump was not found. Install PostgreSQL client tools or add them to PATH." }
$pgDumpPath = if ($pgDump.Source) { $pgDump.Source } else { $pgDump.FullName }

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$databaseFile = Join-Path $backupRoot "keyforge-$stamp.dump"
$databaseUrlForPg = $env:DATABASE_URL -replace '([?&])schema=[^&]*&', '$1' -replace '([?&])schema=[^&]*$', ''
try {
  & $pgDumpPath --dbname=$databaseUrlForPg --format=custom --no-owner --file=$databaseFile
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE." }
} catch {
  if (Test-Path -LiteralPath $databaseFile) { Remove-Item -LiteralPath $databaseFile -Force }
  throw
}

$storageDirectory = if ($env:KEYFORGE_STORAGE_DIR) { $env:KEYFORGE_STORAGE_DIR } else { Join-Path $projectRoot "data\files" }
$filesArchive = Join-Path $backupRoot "keyforge-files-$stamp.zip"
if (Test-Path -LiteralPath $storageDirectory) {
  $storedFiles = Get-ChildItem -LiteralPath $storageDirectory -Force
  if ($storedFiles.Count -gt 0) {
    Compress-Archive -Path $storedFiles.FullName -DestinationPath $filesArchive -CompressionLevel Optimal
  }
}

$manifest = [ordered]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  database = [System.IO.Path]::GetFileName($databaseFile)
  databaseSha256 = (Get-FileHash -LiteralPath $databaseFile -Algorithm SHA256).Hash.ToLowerInvariant()
  files = if (Test-Path -LiteralPath $filesArchive) { [System.IO.Path]::GetFileName($filesArchive) } else { $null }
  filesSha256 = if (Test-Path -LiteralPath $filesArchive) { (Get-FileHash -LiteralPath $filesArchive -Algorithm SHA256).Hash.ToLowerInvariant() } else { $null }
  masterKeyIncluded = $false
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot "keyforge-$stamp.json") -Encoding utf8
Write-Output "Backup completed: $databaseFile"
