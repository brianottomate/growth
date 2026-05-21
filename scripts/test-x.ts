/**
 * Quick smoke test for X (Twitter) API v2 read access.
 * Run: bun scripts/test-x.ts
 */

const bearer = process.env.X_BEARER_TOKEN;
if (!bearer) {
  console.error("Missing X_BEARER_TOKEN in .env");
  process.exit(1);
}

async function xGet(path: string) {
  const url = `https://api.x.com/2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
  });
  const body = await res.text();
  console.log(`\nGET ${path}  →  ${res.status}`);
  try {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  } catch {
    console.log(body);
  }
  return res.status;
}

// 1. User lookup — usually works on any tier
await xGet("/users/by/username/wander");

// 2. Recent search — requires Basic ($200/mo) or higher
await xGet("/tweets/search/recent?query=wander.com&max_results=10");
