import { onError, ORPCError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { BatchHandlerPlugin } from "@orpc/server/plugins";

import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createAPIContext } from "@/server/api/orpc";

// Human-triggered content analysis includes a live source read plus a structured
// model pass. Fluid compute bills for active CPU, not wall time, so a long-running
// mutation (a video analysis that transcribes and then reads ten boards, an
// eight-home ad draft) can take the time it needs instead of being sized to
// fit a two-minute ceiling.
export const maxDuration = 800;

const handler = new RPCHandler(appRouter, {
  plugins: [new BatchHandlerPlugin()],
  interceptors: [
    // Expected refusals (400/403/404) stay quiet; anything that reached a 5xx
    // is logged so it shows up in the Vercel logs.
    onError((error) => {
      if (
        env.NODE_ENV === "development" ||
        !(error instanceof ORPCError) ||
        error.status >= 500
      )
        console.error("[rpc] failed:", error);
    }),
  ],
});

async function handle(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/rpc",
    context: await createAPIContext({ headers: request.headers }),
  });
  return response ?? new Response("Not found", { status: 404 });
}

export { handle as GET, handle as POST };
