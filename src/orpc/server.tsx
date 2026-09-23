import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import {
  dehydrate,
  HydrationBoundary,
  type FetchQueryOptions,
  type QueryKey,
} from "@tanstack/react-query";
import { createRouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { appRouter } from "@/server/api/root";
import { createAPIContext } from "@/server/api/orpc";
import { createQueryClient } from "./query-client";

const createContext = cache(async () =>
  createAPIContext({ headers: new Headers(await headers()) }),
);
const getQueryClient = cache(createQueryClient);

/** Calls procedures in-process with the request's session. */
export const serverApi = createRouterClient(appRouter, {
  context: createContext,
});
export const orpc = createTanstackQueryUtils(serverApi);

export function HydrateClient(props: { children: React.ReactNode }) {
  return (
    <HydrationBoundary state={dehydrate(getQueryClient())}>
      {props.children}
    </HydrationBoundary>
  );
}

export function prefetch<T, E, K extends QueryKey>(
  options: FetchQueryOptions<T, E, T, K>,
) {
  void getQueryClient().prefetchQuery(options);
}
