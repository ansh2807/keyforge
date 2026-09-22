# Production deployment

## Required configuration

Set these values outside source control:

- `DATABASE_URL`: PostgreSQL connection URL for the restricted Keyforge application role.
- `KEYFORGE_MASTER_KEY`: exactly 32 random bytes encoded as base64.
- `KEYFORGE_BASE_URL`: the public HTTPS origin without a trailing slash.
- `KEYFORGE_STORAGE_DIR`: persistent directory for protected files.
- `KEYFORGE_MAX_UPLOAD_MB`: upload limit between 1 and 1024 MB.
- `KEYFORGE_RP_ID`: public hostname used for passkeys, without a scheme.
- `KEYFORGE_RP_ORIGIN`: exact public HTTPS origin used for passkeys.
- `KEYFORGE_RP_NAME`: product-facing passkey relying-party name.
- `KEYFORGE_SMTP_HOST`, `KEYFORGE_SMTP_PORT`, and `KEYFORGE_SMTP_SECURE`: SMTP transport used for administrator email OTP.
- `KEYFORGE_SMTP_USER`, `KEYFORGE_SMTP_PASSWORD`, and `KEYFORGE_SMTP_FROM`: SMTP authentication and sender identity. Keep the password outside source control.

`KEYFORGE_MASTER_KEY` is not a password reset key. It encrypts application signing keys, TOTP seeds, webhook secrets, and notification endpoints. Store it in a secrets manager and back it up separately from PostgreSQL.

## Docker with automatic TLS

Create an environment file readable only by the deployment account:

```dotenv
POSTGRES_PASSWORD=use-a-unique-high-entropy-password
KEYFORGE_MASTER_KEY=base64-encoded-32-byte-value
KEYFORGE_BASE_URL=https://auth.company.test
KEYFORGE_DOMAIN=auth.company.test
KEYFORGE_LEGACY_DOMAIN=old-auth.company.test
ACME_EMAIL=operations@company.test
KEYFORGE_RP_ID=auth.company.test
KEYFORGE_RP_ORIGIN=https://auth.company.test
KEYFORGE_RP_NAME=Company Licensing
KEYFORGE_SMTP_HOST=smtp.gmail.com
KEYFORGE_SMTP_PORT=465
KEYFORGE_SMTP_SECURE=true
KEYFORGE_SMTP_USER=administrator@gmail.com
KEYFORGE_SMTP_PASSWORD=google-app-password
KEYFORGE_SMTP_FROM=Keyforge <administrator@gmail.com>
```

For Gmail, enable Google 2-Step Verification and create a dedicated App Password; never use the normal Google account password. After restarting Keyforge, sign in with the authenticator method, open **Account**, send an email verification code, and verify it before email OTP becomes an available login method. Codes expire after ten minutes, permit five attempts, and are single-use. For higher email volume, use a transactional SMTP provider with the same variables.

On the Linux Docker host, the interactive helper updates `.env` without printing the App Password and safely recreates the web containers:

```bash
chmod 700 scripts/configure-gmail-smtp.sh
./scripts/configure-gmail-smtp.sh
```

Point the domain's A and AAAA records to the host, allow inbound TCP 80 and TCP/UDP 443, then start the public profile:

```bash
docker compose --profile public up --build -d
docker compose ps
curl --fail https://auth.company.test/api/health/ready
```

PostgreSQL and protected files use named volumes. Port 5432 and the direct application port are bound only to loopback. Caddy obtains and renews certificates and proxies requests to the healthy application container.

## Native Windows

The existing local setup uses the PostgreSQL Windows service and does not require Docker.

```powershell
pnpm install --frozen-lockfile
pnpm db:deploy
pnpm build
powershell -ExecutionPolicy Bypass -File scripts/install-windows-startup-task.ps1
```

With administrator rights, the installer creates a boot task under the installing account. Without elevation, it creates a hidden per-user Startup shortcut that runs after Windows sign-in. Both modes apply migrations and write application output to `keyforge-production.log`. Put a TLS reverse proxy in front of `127.0.0.1:3000`; do not expose port 3000 directly to the internet.

## Health and monitoring

- `/api/health/live` confirms the web process can answer HTTP.
- `/api/health/ready` confirms PostgreSQL is reachable and protected-file storage is writable.
- `/api/health` remains the database-focused compatibility check.

Poll readiness from outside the host. Alert on HTTP 503, container or scheduled-task restarts, PostgreSQL disk usage, backup failures, repeated authentication failures, and webhook failures.

Create a seller API key with `webhooks:write` and invoke `POST /api/v1/admin/maintenance` every minute for each application. The operation retries due webhooks and removes expired client artifacts. It is idempotent and safe to call more than once.

## Backup and restore

On a Linux Docker host, run the atomic database and protected-file backup:

```bash
chmod 700 scripts/backup-linux.sh
./scripts/backup-linux.sh
```

It validates the PostgreSQL archive and files tarball, writes SHA-256 checksums, and retains 14 days by default. Set `KEYFORGE_BACKUP_DIR` and `KEYFORGE_BACKUP_RETENTION_DAYS` to override those defaults. Copy completed backup sets to encrypted off-host storage.

On Windows, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup.ps1 -BackupDirectory D:\KeyforgeBackups
```

The backup contains a PostgreSQL custom archive, an optional protected-files archive, and a SHA-256 manifest. It deliberately excludes the master key. Copy all three artifacts to encrypted off-host storage and apply retention controls.

Test recovery on an isolated PostgreSQL instance:

```powershell
$env:DATABASE_URL = "postgresql://keyforge:recovery-password@recovery-host:5432/keyforge?schema=public"
powershell -ExecutionPolicy Bypass -File scripts/restore.ps1 -DatabaseBackup D:\KeyforgeBackups\keyforge-20260813-120000.dump -FilesArchive D:\KeyforgeBackups\keyforge-files-20260813-120000.zip -ConfirmRestore
pnpm db:deploy
```

The restore command uses `pg_restore --clean` and replaces Keyforge objects in the explicitly configured target database. Keep the application stopped while restoring.

## Master-key rotation

Take a verified backup and stop every application instance. Generate a new key, export it only to the maintenance shell, and run the rotation:

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$env:KEYFORGE_NEW_MASTER_KEY = [Convert]::ToBase64String($bytes)
pnpm key:rotate
```

After the transaction completes, replace `KEYFORGE_MASTER_KEY` in every instance with the new value before restarting. Retain the old key with the pre-rotation backup until a restore exercise confirms the new backup.

## Release procedure

1. Review dependency and migration changes.
2. Run `pnpm check` and `pnpm sdk:check`.
3. Take a database and files backup.
4. Deploy the immutable image or release directory.
5. Apply `pnpm db:deploy`; never use `prisma migrate dev` in production.
6. Verify liveness, readiness, dashboard login, a test activation, a heartbeat, and a revocation.
7. Monitor error rate and webhook delivery for at least one session lifetime.

Obtain an independent security assessment before storing regulated data or offering the service to untrusted tenants.
