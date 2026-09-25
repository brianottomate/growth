# Google Ads server access

Growth can authenticate directly to Google Ads using a dedicated service account.
Zernio continues to manage its own connection and developer token.

Production secrets belong in Doppler `wander-growth/prd`, synced to the
`wanderdev/growth` Vercel Production environment:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | Service account JSON with its private key |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Approved Google Ads developer token |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Manager account ID |

The service account must be added to the manager's Google Ads access list.
Google Cloud IAM access alone does not grant access to Google Ads.
Use a dedicated Ads identity; keep the existing BigQuery identity separate.
Changes to synced environment variables take effect on a new deployment.

The direct client uses Google Ads API v25. It exchanges an RS256 assertion for
an access token scoped to `https://www.googleapis.com/auth/adwords`, caching the
token until one minute before expiry. It does not impersonate an employee.
The optional existing user OAuth configuration remains supported when the
service account variable is absent. A malformed service account fails closed.

## Verify from the deployed server

Call `GET /api/admin/google-ads` with `Authorization: Bearer <ADMIN_TOKEN>`.
The endpoint runs a fixed read-only query against the configured manager.
A successful response includes `authMode: "service_account"`, the manager ID,
name and enabled status. Credentials and upstream error bodies are never returned.
Unauthenticated requests receive 401. Missing configuration receives 503;
failed access or an invalid manager receives 502.

This verifies authentication and manager read access. Account creation and other
writes need separate validation of permissions and approved API use.

The spend tracker also uses this client, but remains inactive until its separate
`GOOGLE_ADS_CUSTOMER_ID` is configured. That variable selects the reporting child
account; it must never point at the manager. Supplying only the three server
credentials above does not enable or change spend reporting.

## Rotation

Create a replacement key for the same service identity, update the service-account
JSON in Doppler, and deploy. Verify the authenticated endpoint before revoking the
old key. Keep key material out of repository files, logs and command arguments.
