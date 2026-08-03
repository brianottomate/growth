// @ts-check
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { defineConfig, envField, fontProviders } from "astro/config";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  server: {
    port: 4400,
    host: true,
  },
  integrations: [react(), icon()],
  fonts: [
    {
      provider: fontProviders.local(),
      name: "Instrument Sans",
      cssVariable: "--font-instrument-sans",
      options: {
        variants: [
          {
            weight: "100 900",
            style: "normal",
            src: ["@wandercom/design-system-fonts/instrument-sans/instrument-sans.woff2"],
            display: "swap",
          },
          {
            weight: "100 900",
            style: "italic",
            src: ["@wandercom/design-system-fonts/instrument-sans/instrument-sans-italic.woff2"],
            display: "swap",
          },
        ],
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      // Keep the registry inside Vite's resolver so the icons-root alias
      // below applies in dev SSR too. Design-system packages stay external:
      // they're CJS, and Node's import-CJS interop handles them correctly
      // where Vite's ESM bundling would not.
      noExternal: ["@wandercom/website-registry"],
    },
    resolve: {
      alias: [
        // Published registry dist imports the icons package ROOT, which the
        // published icons package doesn't export ("./*" only). Exact-match
        // regex so subpath imports (including the shim's own) pass through.
        {
          find: /^@wandercom\/design-system-icons$/,
          replacement: new URL(
            "./src/shims/design-system-icons.ts",
            import.meta.url,
          ).pathname,
        },
      ],
    },
  },
  env: {
    schema: {
      PREGEN_API_URL: envField.string({ context: "server", access: "secret" }),
      PUBLIC_API_URL: envField.string({ context: "client", access: "public", optional: true }),
      PUBLIC_IMAGE_API_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_VIDEO_API_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_STRIPE_PUBLISHABLE_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_MAX_GUESTS: envField.number({ context: "client", access: "public", optional: true }),
      PUBLIC_WEBSITE_DOMAIN: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_GOOGLE_MAPS_API_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_CLICKSTREAM_URL: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_AMPLITUDE_API_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_AMPLITUDE_EXPERIMENT_KEY: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_GOOGLE_TAG_MANAGER_ID: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      PUBLIC_FACEBOOK_PIXEL_ID: envField.string({
        context: "client",
        access: "public",
        optional: true,
      }),
      DEV: envField.boolean({ context: "client", access: "public", optional: true }),
    },
  },
});
