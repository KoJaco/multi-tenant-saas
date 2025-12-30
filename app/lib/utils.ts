import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function notFound() {
    throw new Response("Not Found", { status: 404 });
}

/**
 * Formats a duration in seconds to a human-readable string in minutes and seconds
 * @param seconds - Duration in seconds
 * @returns Formatted string like "2m 30s" or "45s" if less than a minute
 */
export function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return "0s";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (minutes === 0) {
        return `${remainingSeconds}s`;
    }

    return `${minutes}m ${remainingSeconds}s`;
}
