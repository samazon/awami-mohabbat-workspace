/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Set by the middleware on /admin requests, after Cloudflare Access + the admin_users check. */
    admin?: import('./lib/admin/access').AdminIdentity;
  }
}
