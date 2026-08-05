# Connect Claude to Growth

Growth's production MCP resource is:

```text
https://growth-red.vercel.app/api/mcp
```

Add that URL as a remote custom connector in the content operator's own Claude
client. Claude discovers Growth's OAuth metadata automatically. Sign in with the
operator's Growth account, choose the intended organization on the consent
screen, and approve access.

The connector and the in-house chat use the same capability catalog. A content
operator can therefore inspect and edit ideas, platform drafts, series,
first-comment copy, media, and amplification plans from either surface.

External effects stay explicit:

- Zernio scheduling, immediate publishing, rescheduling, and provider-side
  first-comment updates require approval.
- Planning an amplification target does not contact the person. Slack is sent
  only through the separate notify action, which also requires approval. The
  configured coordinator is tagged and the actual amplifier is named in the
  request.
- Ad reads require an exact owned brand slug and only consume accounts allowed
  for that brand.

If authorization succeeds but tools do not appear, remove the stale connector
grant and reconnect. If authorization fails, confirm that the operator is still
a live member of the selected Growth organization. Do not replace the remote
resource with a local MCP server or create a second connector registry.

After a deployment, verify the remote endpoint with the repository's protocol
and OAuth smoke checks before telling operators the connector is live.
