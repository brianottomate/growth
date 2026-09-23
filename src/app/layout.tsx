import "@/styles/globals.css";

import { Geist_Mono } from "next/font/google";
import { instrumentSans } from "@wandercom/design-system-fonts/next";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { cn } from "@/components/ui/lib/utils";
import { ThemeProvider } from "@/components/ui/theme";
import { Toaster } from "@/components/ui/toast";
import { AnalyticsProvider } from "@/contexts/AnalyticsContext";
import { rootMetadata } from "@/lib/metadata";

import { QueryProvider } from "@/orpc/react";

export const metadata = rootMetadata;

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  preload: true,
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme="dark"
      className={cn(instrumentSans.variable, geistMono.variable)}
    >
      <body className="min-h-screen bg-surface-primary font-sans text-primary antialiased">
        <QueryProvider>
          <ThemeProvider>
            <AnalyticsProvider>
              <NuqsAdapter>{children}</NuqsAdapter>
            </AnalyticsProvider>
          </ThemeProvider>
        </QueryProvider>
        <Toaster />
      </body>
    </html>
  );
}
