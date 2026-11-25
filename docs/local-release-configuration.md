# Local email and release configuration

This guide covers preparing local configuration only. Do not paste credentials into chat, commit them, or place them in client-side code. Keep secrets in the ignored local `.env` file; configure deployment values through the actual hosting provider's secret/environment-variable manager after that provider is identified.

## SMTP provider and verified sender

Obtain SMTP settings from the email provider's official account or SMTP documentation. Record the SMTP host, port, TLS mode, authentication username, and a provider-issued SMTP credential. Verify the sender address in that provider before sending mail. The authenticated account and sender can differ only if the provider explicitly authorizes that sender.

Set these canonical variables in local `.env`:

| Variable | Expected format |
|---|---|
| `SMTP_HOST` | SMTP server hostname only; no scheme, path, or port suffix. Use the host supplied by the chosen provider. |
| `SMTP_PORT` | Decimal TCP port from the provider, from `1` through `65535`. |
| `SMTP_SECURE` | `true` or `false`. Set according to whether the provider requires TLS immediately on connection. |
| `SMTP_REQUIRE_TLS` | `true` or `false`. For port `587`, this application requires `SMTP_SECURE=false` and `SMTP_REQUIRE_TLS=true` (STARTTLS). |
| `SMTP_USER` | Exact SMTP authentication username supplied by the provider. |
| `SMTP_PASSWORD` | Provider-issued SMTP credential, such as an app password or SMTP-specific password. Treat as a secret; do not use an ordinary mailbox password unless the provider explicitly requires and permits it. |
| `SMTP_FROM` | Provider-verified sender mailbox, optionally with a display name in standard mail-header format. Use only a sender authorized by the provider. |

Set all seven values explicitly rather than relying on application defaults. The application also recognizes the legacy aliases `SMTP_USERNAME` for `SMTP_USER` and `EMAIL_FROM` for `SMTP_FROM`; prefer the canonical names and do not set conflicting aliases.

After updating values locally, check the provider's authentication and sender-verification status in its console. Do not repeatedly retry a rejected credential. Actual delivery must be confirmed in the controlled inbox; a generated message or local SMTP sink is not delivery evidence.

The example environment also includes these server-side application settings:

| Variable | Expected format |
|---|---|
| `DATABASE_URL` | PostgreSQL connection URI supplied for the intended environment. Use `sslmode=verify-full` when specifying SSL. Keep it server-side and never copy a Production URI into `.env.staging`. |
| `ADMISSION_DATA_ENCRYPTION_KEY` | Base64 encoding of 32 random bytes. Keep the same key across deployments and backups for data encrypted with it; store it as a secret. |

## Controlled test inbox

There is no controlled-recipient environment variable in the current application configuration. Obtain the exact inbox address from the person who controls it and use that address only for the single explicitly controlled delivery test. Do not infer it from prior placeholders, student records, or sender settings. Do not send test messages to students or other recipients.

The staging E2E runner replaces SMTP with a localhost-only sink and restricts recipients to its synthetic test domain. Its passing checks validate local message generation and workflow tracking, not external email delivery.

## Public HTTPS application URL

Set `NEXT_PUBLIC_APP_URL` in local `.env` to the public application origin:

```dotenv
NEXT_PUBLIC_APP_URL=https://<authorized-public-hostname>
```

Replace the placeholder locally with the actual authorized HTTPS origin. Do not include credentials, a path, query string, or fragment. The application creates login and password-setup/reset links from this origin. Production mode rejects non-HTTPS URLs. Set this before the production build/deployment so generated links use the intended public host. Local development may use a local HTTP origin; it is not suitable for production email links.

## Hosting provider and deployment environment

No hosting-provider or deployment descriptor was found in the inspected project files. Next.js and the `start` script do not identify where the application is hosted. Do not assume a provider.

Before entering production configuration:

1. Identify the actual provider and application/project from the owner's hosting account, existing deployment records, or deployment operator.
2. Confirm which environment is production and who can manage its secrets. Do not change production settings as part of this preparation.
3. Configure the SMTP variables above and `NEXT_PUBLIC_APP_URL` only in the provider's server-side production environment settings. Mark `SMTP_PASSWORD` as secret. Do not expose SMTP credentials through `NEXT_PUBLIC_*`.
4. Confirm the provider's build and runtime environment use the same intended application URL and server-side settings. Keep the public URL HTTPS.
5. Before any live message, confirm SMTP authentication, verified sender status, the exact controlled inbox, and actual receipt. No message should be sent until those external values are available and confirmed.

Do not configure or switch the production database as part of this guide. No Production connection, deployment, DNS change, or Production setting change is authorized here.

## Staging safeguards and local tests

Keep the existing `.env.staging` settings intact, including `ALLOW_STAGING_MIGRATIONS=false`. Do not add a production `DATABASE_URL` to `.env.staging` or use the staging E2E command as a migration command.

The authorized staging suite remains available with `npm run test:staging` after explicitly setting `STAGING_E2E=1` in the local process environment. It uses synthetic records on the configured staging branch and a local SMTP sink; it does not verify external delivery. The staging migration gate must remain disabled.

The relevant staging environment variable names are `MIGRATION_TARGET`, `ALLOW_STAGING_MIGRATIONS`, `STAGING_RECOVERY_VERIFIED`, `STAGING_DATABASE_URL`, `STAGING_NEON_PROJECT_ID`, `STAGING_NEON_BRANCH_ID`, `PRODUCTION_NEON_PROJECT_ID`, and `PRODUCTION_NEON_BRANCH_ID`. Keep their existing values private; this guide does not require changing them.

Their expected shapes are: `MIGRATION_TARGET=staging`; `ALLOW_STAGING_MIGRATIONS=false`; `STAGING_RECOVERY_VERIFIED` is the literal `true` or `false` and may be `true` only after recovery has been independently verified; `STAGING_DATABASE_URL` is a PostgreSQL URI for the staging branch; and each `*_NEON_*_ID` is the corresponding identifier copied from Neon Console. These settings are for staging safeguards and identity checks, not Production configuration.
