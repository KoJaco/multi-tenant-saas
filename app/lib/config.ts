/**
 * Public (Client-safe) Configuration
 *
 * This module can be safely imported in client-side code.
 * Only exposes non-sensitive configuration values.
 */

import { publicConfig } from "./config.server";

// Re-export public config for client-side use
export const config = publicConfig;
export type Config = typeof config;
