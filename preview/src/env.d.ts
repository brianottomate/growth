declare namespace App {
  interface Locals {
    /** Preview token for this request: `?t=` if present, else the cookie. */
    previewToken: string | null;
    /** Prospect slug when the request arrived on a preview subdomain. */
    previewSlug: string | null;
  }
}
