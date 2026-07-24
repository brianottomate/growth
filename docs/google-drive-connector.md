# Google Drive connector

Pulls creative out of Drive and rehosts it in Growth's own media library. Read-only — Growth never writes to Drive.

## How it works

Drive rides on the **existing better-auth Google account**, not a bespoke connection table. The user already signs in with their Wander Google account, so "Connect Drive" is an incremental-consent re-link (`authClient.linkSocial` with one extra scope) against that same `account` row.

That is the main design decision, and it deletes most of the usual OAuth work: better-auth already owns the authorize redirect, PKCE, the callback route, refresh-token storage, and rotation. `auth.api.getAccessToken({ providerId: "google", userId })` returns a valid access token and refreshes when needed, so no code here ever touches a refresh token.

(For contrast, Capient's Outlook integration hand-rolls all of that — `external_account_connection`, AES-256-GCM envelopes, an HMAC-signed state cookie, a callback route. That shape is right when the provider isn't already your sign-in provider. Here it is, so we don't pay for it.)

```
UI (GoogleDriveImportDialog)
  └─ tRPC googleDrive.{status,browse,importFiles,importFolder}
       └─ google-drive.service   ← better-auth getAccessToken (refresh)
            └─ google-drive.client (thin, origin-checked fetch on Drive v3)
                 └─ MediaService.importImageBuffer → R2 + media_asset row
```

Imports **rehost** rather than link. A Drive URL needs the _viewer's_ credentials, so a linked asset would 403 for teammates and for anything server-side. Bytes land in R2 under the normal media key layout, with `sourceProvider = "google_drive"`, the Drive `webViewLink` kept in `externalUrl`, and the file id in `metadata.driveFileId`.

Thumbnails come from Drive's own rendered `thumbnailLink` (resized via its `=s640` suffix) rather than re-encoding server-side — cheaper, and it slots into the same `thumbnailUrl` tile the browser upload path fills.

Order is preserved end to end: input order → pool order → carousel slide order.

## Setup (one-time, ~5 minutes)

Everything below happens in Google Cloud project **`wander-growth-ads-mcp`** as **kristian@wander.com**. Until it's done, the feature degrades gracefully: `status.configured` is `false` and the dialog says so instead of erroring.

1. **OAuth consent screen** → set **User type: Internal**.
   This is the important one. `drive.readonly` is a Google _restricted_ scope; an **External** app using it needs a third-party CASA security assessment (slow, paid). An **Internal** app — Workspace users only — skips verification entirely. Since only Wander staff use Growth, Internal is both cheaper and more correct.

2. **Enable the Google Drive API**
   `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=wander-growth-ads-mcp`

3. **Create an OAuth client** → _APIs & Services → Credentials → Create credentials → OAuth client ID → Web application_. Authorized redirect URIs:

   ```
   http://localhost:3000/api/auth/callback/google
   https://kristianeboe-65.beta.localcan.dev/api/auth/callback/google
   https://growth-red.vercel.app/api/auth/callback/google
   ```

   (`/api/auth/callback/:provider` is better-auth's own path — it's already mounted at `src/app/api/auth/[...all]/route.ts`.)

4. **Store the credentials.** They're read by `src/env.ts` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — the same pair the dormant Google SSO code has been waiting on, so this lights that up too.

   ```bash
   doppler secrets set GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET --project wander-growth --config dev
   ```

   Repeat for `stg` and `prd`, and add both to local `.env`.

5. **Restart the dev server**, open `/app/media`, click **Drive** → **Connect Google Drive**, and approve the Drive scope.

## Using it

- **UI** — `/app/media` → _Drive_, or the _Drive_ tile in a content item's media pool. Browse or search, click into folders, select images in the order you want them, import. Imports into the content pool land in the media pool directly.
- **Agents / MCP** — `driveRead.status`, `driveRead.browse` (resolve names → file ids), then `contentMediaWrite.importFromDrive` with `fileIds` in slide order, then `contentMediaWrite.makeCarousel`. Deliberately kept as primitives so a caller composes the steps and sees each one.

## Notes and limits

- Scope requested: `https://www.googleapis.com/auth/drive.readonly`.
- Only image types the library already accepts (jpeg, png, webp, avif, gif); 25 MB per file, matching direct upload.
- Shared drives are included (`supportsAllDrives`, `corpora=allDrives`) — brand creative usually lives in one.
- Google Docs/Sheets/Slides are **not** exported; only real image files are listed and imported.
- Per-file failures are collected and returned rather than aborting the batch, so one bad file doesn't lose the rest.
- The connection is per-user, not per-org: each person grants their own Drive access, and imports run as whoever clicked.
