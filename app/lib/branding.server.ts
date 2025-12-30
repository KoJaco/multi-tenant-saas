/**
 * Branding Configuration
 * 
 * Centralized branding configuration to avoid hardcoded values
 */

export const branding = {
    name: process.env.APP_NAME || "Multi-Tenant",
    shortName: process.env.APP_SHORT_NAME || process.env.APP_NAME || "App",
} as const;

/**
 * Get the application name
 */
export function getAppName(): string {
    return branding.name;
}

/**
 * Get the short application name (for headers, etc.)
 */
export function getAppShortName(): string {
    return branding.shortName;
}

