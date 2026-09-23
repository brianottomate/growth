"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";

import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined = undefined;
const getQueryClient = () => {
  // Server: always make a new query client. Browser: keep one.
  if (typeof window === "undefined") return createQueryClient();
  return (clientQueryClientSingleton ??= createQueryClient());
};

export function QueryProvider(props: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {props.children}
    </QueryClientProvider>
  );
}
