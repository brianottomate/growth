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
