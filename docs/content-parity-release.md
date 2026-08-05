# Content parity release

This slice changes application code and adds an explicit database release step.
It is not live until every gate below is complete.

## 1. Apply schema deliberately

The additive migration was rehearsed on an expiring Neon branch. Apply it to
production only with an approved release operation:

```sh
bun run db:apply:content-parity
```

The script adds first-comment delivery fields, Slack amplification receipts,
amplifier Slack member IDs, and brand ownership for ad accounts. It refuses to
finish if an allowed ad account remains unscoped.

## 2. Configure provider boundaries

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

## 3. Deploy and verify

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

Only after those checks is the slice live rather than code-complete.
