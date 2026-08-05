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
    server: {
      // Dev only. Vite rejects unexpected Host headers, which blocks testing
      // host-mode previews locally with `curl -H "Host: slug.zone"` or a
      // /etc/hosts entry. Production host handling is the middleware's job.
      allowedHosts: [".trywanderos.com", ".localhost", "localhost"],
    },
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
      // Canonical API hostnames. `api.gke.*.wander.com` still resolves to the
      // same backend but is the deprecated legacy form — don't reintroduce it.
      MONOLITH_STG_API_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "https://api.staging.wander.com",
      }),
      MONOLITH_PROD_API_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "https://api.wander.com",
      }),
      // Where "Claim this site" hands off. app.wander.com onboarding v3 reads
      // the claim params (app#1519).
      APP_BASE_URL: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "https://app.wander.com",
      }),
      // Apex of the per-prospect preview zone, e.g. "trywanderos.com". Unset
      // means host mode is off and only /p/ and /m/ resolve.
      PREVIEW_HOST_ZONE: envField.string({
        context: "server",
        access: "secret",
        optional: true,
        default: "",
      }),
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
