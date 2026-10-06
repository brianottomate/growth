import { unsubscribeRecipient } from "@/server/services/lifecycle-runtime/service";
export const runtime = "nodejs";
const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'none'; form-action 'self'; frame-ancestors 'none'",
};
// GET is a confirmation only: scanners following links must not unsubscribe people.
export async function GET() {
  return new Response(
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email preferences</title><h1>Unsubscribe from lifecycle emails</h1><p>This stops lifecycle emails from this brand.</p><form method="post"><button type="submit">Unsubscribe</button></form></html>',
    { headers },
  );
}
export async function POST(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) await unsubscribeRecipient(token);
  return new Response(
    '<!doctype html><html lang="en"><title>Unsubscribed</title><h1>You are unsubscribed</h1><p>You will no longer receive lifecycle emails from this brand.</p></html>',
    { headers },
  );
}
