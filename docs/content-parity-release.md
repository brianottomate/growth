# Content parity release

Schema changes are applied by the release workflow using committed Drizzle
migrations. First-comment delivery fields, Slack amplification receipts,
amplifier Slack member IDs, and brand-owned ad accounts are part of the schema.

## Configure provider boundaries

Required for Zernio publishing:

- `ZERNIO_API_KEY`
- `ZERNIO_WEBHOOK_SECRET`
- an owned brand with a Zernio profile
- connected, active channels whose default provider is Zernio

Register the signed webhook at:

```text
https://growth-red.vercel.app/api/webhooks/zernio
```

Required for human amplification notification:

- `SLACK_API_TOKEN`
- `SLACK_AMPLIFICATION_CHANNEL_ID`
- `SLACK_AMPLIFICATION_COORDINATOR_USER_ID`
- the bot invited to that channel
- optionally, a direct Slack member ID stored on an amplifier as a fallback

## Deploy and verify

Before merge/deploy:

```sh
bun run check
bun test
bun run ai:contracts
bun run test:mcp:protocol
```

On preview, verify that Slack redirects to the testing channel and that planning
an amplification target sends nothing. Do not perform a Zernio provider write
without explicit operator approval.

After production deployment:

1. Reconnect a personal Claude client using
   `https://growth-red.vercel.app/api/mcp` and verify the selected organization.
2. Prepare a first comment locally and confirm no provider job changes.
3. With approval, schedule one reviewed post through Zernio and retain its
   provider job ID.
4. Move the scheduled time and confirm both Zernio and Growth reflect the new
   time.
5. Trigger or await a signed delivery webhook and confirm the final native URL
   and delivery state reconcile.
6. With approval, notify one test amplifier. Confirm the Slack tag and the
   stored channel/message timestamp, then retry and prove it does not duplicate.
7. Read ads for `wander` and `wanderos` separately and confirm no account appears
   outside its assigned brand.
