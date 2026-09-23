import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { BatchLinkPlugin } from "@orpc/client/plugins";
import type {
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient,
} from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import type { AppRouter } from "@/server/api/root";

export type RouterInputs = InferRouterInputs<AppRouter>;
export type RouterOutputs = InferRouterOutputs<AppRouter>;

const client: RouterClient<AppRouter> = createORPCClient(
  new RPCLink({
    url: () => `${getBaseUrl()}/api/rpc`,
    // Calls made in the same tick share one request; responses stream back
    // as each procedure finishes.
    plugins: [
      new BatchLinkPlugin({
        groups: [{ condition: () => true, context: {} }],
        url: () => `${getBaseUrl()}/api/rpc/__batch__`,
      }),
    ],
  }),
);

export const orpc = createTanstackQueryUtils(client);

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT ?? 3000}`;
}
