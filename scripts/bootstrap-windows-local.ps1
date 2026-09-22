param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-Base64UrlSecret([int]$ByteCount) {
  $bytes = [byte[]]::new($ByteCount)
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  } finally {
    $generator.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$resolvedRoot = [IO.Path]::GetFullPath($ProjectRoot)
$expectedManifest = Join-Path $resolvedRoot "package.json"
if (-not (Test-Path -LiteralPath $expectedManifest)) {
  throw "The Keyforge package.json was not found at $resolvedRoot"
}

$envPath = Join-Path $resolvedRoot ".env"
$recoveryPath = Join-Path $resolvedRoot ".keyforge-bootstrap.json"
if (Test-Path -LiteralPath $envPath) {
  throw "A .env file already exists. Refusing to overwrite existing Keyforge secrets."
}

if (Test-Path -LiteralPath $recoveryPath) {
  $secrets = Get-Content -LiteralPath $recoveryPath -Raw | ConvertFrom-Json
} else {
  $masterBytes = [byte[]]::new(32)
  $masterGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $masterGenerator.GetBytes($masterBytes)
  } finally {
    $masterGenerator.Dispose()
  }
  $secrets = [pscustomobject]@{
    postgresSuperPassword = "Kf9!" + (New-Base64UrlSecret 27)
    applicationPassword = New-Base64UrlSecret 30
    masterKey = [Convert]::ToBase64String($masterBytes)
  }
  [IO.File]::WriteAllText(
    $recoveryPath,
    ($secrets | ConvertTo-Json),
    [Text.UTF8Encoding]::new($false)
  )
}

$psqlPath = "C:\Program Files\PostgreSQL\17\bin\psql.exe"
$createdbPath = "C:\Program Files\PostgreSQL\17\bin\createdb.exe"
if (-not (Test-Path -LiteralPath $psqlPath)) {
  $installerOptions = @(
    "--mode unattended",
    "--unattendedmodeui minimal",
    "--serverport 5432",
    "--servicename postgresql-x64-17",
    "--superpassword $($secrets.postgresSuperPassword)",
    "--servicepassword $($secrets.postgresSuperPassword)"
  ) -join " "

  & winget install `
    --id PostgreSQL.PostgreSQL.17 `
    --exact `
    --source winget `
    --silent `
    --accept-package-agreements `
    --accept-source-agreements `
    --disable-interactivity `
    --override $installerOptions
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL installation failed with exit code $LASTEXITCODE. Recovery secrets remain in $recoveryPath."
  }
}

if (-not (Test-Path -LiteralPath $psqlPath) -or -not (Test-Path -LiteralPath $createdbPath)) {
  throw "PostgreSQL finished installing, but its command-line tools were not found."
}

$service = Get-Service -Name "postgresql-x64-17" -ErrorAction Stop
if ($service.Status -ne "Running") {
  Start-Service -Name $service.Name
  $service.WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
}

$previousPgPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $secrets.postgresSuperPassword
  $roleExists = & $psqlPath --host localhost --port 5432 --username postgres --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_roles WHERE rolname = 'keyforge'"
  if ($LASTEXITCODE -ne 0) { throw "Could not connect to the new PostgreSQL service." }

  if (($roleExists | Out-String).Trim() -eq "1") {
    & $psqlPath --host localhost --port 5432 --username postgres --dbname postgres --set ON_ERROR_STOP=1 --command "ALTER ROLE keyforge WITH LOGIN PASSWORD '$($secrets.applicationPassword)'"
  } else {
    & $psqlPath --host localhost --port 5432 --username postgres --dbname postgres --set ON_ERROR_STOP=1 --command "CREATE ROLE keyforge WITH LOGIN PASSWORD '$($secrets.applicationPassword)'"
  }
  if ($LASTEXITCODE -ne 0) { throw "Could not configure the Keyforge database role." }

  $databaseExists = & $psqlPath --host localhost --port 5432 --username postgres --dbname postgres --tuples-only --no-align --command "SELECT 1 FROM pg_database WHERE datname = 'keyforge'"
  if ($LASTEXITCODE -ne 0) { throw "Could not inspect PostgreSQL databases." }
  if (($databaseExists | Out-String).Trim() -ne "1") {
    & $createdbPath --host localhost --port 5432 --username postgres --owner keyforge keyforge
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Keyforge database." }
  }
} finally {
  $env:PGPASSWORD = $previousPgPassword
}

$encodedApplicationPassword = [Uri]::EscapeDataString([string]$secrets.applicationPassword)
$envContents = @"
DATABASE_URL="postgresql://keyforge:$encodedApplicationPassword@localhost:5432/keyforge?schema=public"
KEYFORGE_MASTER_KEY="$($secrets.masterKey)"
KEYFORGE_BASE_URL="http://localhost:3000"
KEYFORGE_SESSION_DAYS="7"
KEYFORGE_DEMO_MODE="false"
KEYFORGE_STORAGE_DIR="./data/files"
KEYFORGE_MAX_UPLOAD_MB="50"
KEYFORGE_RP_ID="localhost"
KEYFORGE_RP_NAME="Keyforge"
KEYFORGE_RP_ORIGIN="http://localhost:3000"
"@
[IO.File]::WriteAllText($envPath, $envContents, [Text.UTF8Encoding]::new($false))

Push-Location $resolvedRoot
try {
  & pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed." }
  & pnpm db:deploy
  if ($LASTEXITCODE -ne 0) { throw "Database migration failed." }
} finally {
  Pop-Location
}

Remove-Item -LiteralPath $recoveryPath -Force
Write-Output "Keyforge local infrastructure is configured successfully."
