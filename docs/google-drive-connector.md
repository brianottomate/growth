# Google Drive connector

Pulls creative out of Drive and rehosts it in Growth's own media library. Read-only — Growth never writes to Drive.

## How it works

Drive is its own linked account — provider id `google-drive`, registered through better-auth's **generic-OAuth plugin** with its own OAuth client, separate from Google sign-in.

That separation is the main design decision, and it is load-bearing for two concrete reasons:

1. **Google revokes per app grant, not per scope.** Sharing the sign-in client would mean someone revoking Drive access at `myaccount.google.com/permissions` also kills the refresh token that logs them into Growth.
2. **Account linking is on** (`trustedProviders: ["google"]`). Asking the sign-in provider for Drive scopes would give an email/password user a Google login they never opted into. Connecting a file source must not change how anyone authenticates.

Separation costs no token plumbing, because the plugin registers its providers into better-auth's internal `socialProviders` map. So `auth.api.getAccessToken({ providerId: "google-drive", userId })` still returns a valid token and refreshes when needed — no OAuth route, no encryption envelope, no state cookie, and no code here ever touches a refresh token.

(For contrast, Capient's Outlook integration hand-rolls all of that — `external_account_connection`, AES-256-GCM envelopes, an HMAC-signed state cookie, a callback route. Correct there, because Microsoft isn't its sign-in provider and it has no equivalent plugin.)

```
UI (GoogleDriveImportDialog)
  └─ oRPC googleDrive.{status,browse,importFiles,importFolder}
       └─ google-drive.service   ← getAccessToken("google-drive") (refresh)
            └─ google-drive.client (thin, origin-checked fetch on Drive v3)
                 └─ MediaService.importImageBuffer → R2 + media_asset row
```

Imports **rehost** rather than link. A Drive URL needs the _viewer's_ credentials, so a linked asset would 403 for teammates and for anything server-side. Bytes land in R2 under the normal media key layout, with `sourceProvider = "google_drive"`, the Drive `webViewLink` kept in `externalUrl`, and the file id in `metadata.driveFileId`.

Thumbnails come from Drive's own rendered `thumbnailLink` (resized via its `=s640` suffix) rather than re-encoding server-side — cheaper, and it slots into the same `thumbnailUrl` tile the browser upload path fills.

Order is preserved end to end: input order → pool order → carousel slide order.

## Setup (one-time, ~5 minutes)

**This is already done** in Google Cloud project `wander-growth-ads-mcp` — recorded here so it can be reproduced or audited.

1. **OAuth consent screen: User type = Internal.** `drive.readonly` is a Google _restricted_ scope; an **External** app using it needs a third-party CASA security assessment (slow, paid). An **Internal** app — Workspace users only — skips verification entirely.

2. **Google Drive API enabled.**

3. **OAuth client "Growth Drive Connector"** (Web application), separate from the existing "Growth Tracker (Better Auth)" sign-in client. Authorized redirect URIs — note the generic-OAuth callback path, which differs from the social-provider one:

   ```
   http://localhost:3000/api/auth/oauth2/callback/google-drive
   https://kristianeboe-65.beta.localcan.dev/api/auth/oauth2/callback/google-drive
   https://growth-red.vercel.app/api/auth/oauth2/callback/google-drive
   ```

4. **Credentials stored** as `GOOGLE_DRIVE_CLIENT_ID` / `GOOGLE_DRIVE_CLIENT_SECRET` in Doppler `wander-growth` dev/stg/prd and local `.env`. Distinct from `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, which remain reserved for Google sign-in and are still unset.

   > Two client secrets currently exist on the Drive client: the original (never captured anywhere) and the one in use. Delete the unused one in the console — Google flags having two as a risk.

5. Open `/app/media` → **Drive** → **Connect Google Drive**, and approve.

## Using it

- **UI** — `/app/media` → _Drive_, or the _Drive_ tile in a content item's media pool. Browse or search, click into folders, select images in the order you want them, import. Imports into the content pool land in the media pool directly.
- **Agents / MCP** — `driveRead.status`, `driveRead.browse` (resolve names → file ids), then `contentMediaWrite.importFromDrive` with `fileIds` in slide order, then `contentMediaWrite.makeCarousel`. Deliberately kept as primitives so a caller composes the steps and sees each one.

## Notes and limits

- Scopes requested: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.readonly`. `profile` is not optional — the plugin resolves the account against Google's userinfo and rejects a response with no name (`name_is_missing`).
- `accessType: "offline"` + `prompt: "consent"` — Google only issues a refresh token with both.
- Only image types the library already accepts (jpeg, png, webp, avif, gif); 25 MB per file, matching direct upload.
- Shared drives are included (`supportsAllDrives`, `corpora=allDrives`) — brand creative usually lives in one.
- Google Docs/Sheets/Slides are **not** exported; only real image files are listed and imported.
- Per-file failures are collected and returned rather than aborting the batch, so one bad file doesn't lose the rest.
- The connection is per-user, not per-org: each person grants their own Drive access, and imports run as whoever clicked.
- Thumbnails are stored as `<key>.thumb.<ext>` matching the tile's real content type (Drive returns JPEG; browser uploads encode WebP).

## Verified

Against real credentials and a real Drive on 2026-07-25: consent round trip completed (`connected: true`), `browse` returned live Wander Drive folders and images, and `importFiles` copied two 1280x720 JPEGs into R2 with byte sizes matching Drive exactly, thumbnails generated, `sourceProvider = "google_drive"`, and all objects serving 200. Test assets were deleted afterwards.
