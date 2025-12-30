/**
 * MFA Utility Functions
 *
 * Helper functions for Multi-Factor Authentication operations
 */

import { db } from "~/lib/db/index.server";
import { users } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface MfaStatus {
    enrolled: boolean;
    enrolledAt: Date | null;
    method: string | null;
    lastMfaAt: Date | null;
    required: boolean;
    requiredReason: string | null;
}

/**
 * Get MFA enrollment status from database
 */
export async function getMfaStatus(userId: string): Promise<MfaStatus | null> {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: {
            mfaEnrolled: true,
            mfaEnrolledAt: true,
            mfaMethod: true,
            lastMfaAt: true,
            mfaRequired: true,
            mfaRequiredReason: true,
        },
    });

    if (!user) {
        return null;
    }

    return {
        enrolled: user.mfaEnrolled,
        enrolledAt: user.mfaEnrolledAt,
        method: user.mfaMethod,
        lastMfaAt: user.lastMfaAt,
        required: user.mfaRequired,
        requiredReason: user.mfaRequiredReason,
    };
}

/**
 * Check if MFA is required for a user
 */
export async function checkMfaRequired(userId: string): Promise<boolean> {
    const status = await getMfaStatus(userId);
    return status?.required ?? false;
}

/**
 * Update MFA enrollment status in database
 */
export async function updateMfaEnrollment(
    userId: string,
    enrolled: boolean,
    method: string | null = null
): Promise<void> {
    await db
        .update(users)
        .set({
            mfaEnrolled: enrolled,
            mfaEnrolledAt: enrolled ? new Date() : null,
            mfaMethod: method,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
}

/**
 * Update last MFA verification time
 */
export async function updateLastMfaAt(userId: string): Promise<void> {
    await db
        .update(users)
        .set({
            lastMfaAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
}

/**
 * Set MFA requirement for a user
 */
export async function setMfaRequired(
    userId: string,
    required: boolean,
    reason: string | null = null
): Promise<void> {
    await db
        .update(users)
        .set({
            mfaRequired: required,
            mfaRequiredReason: reason,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
}

/**
 * Initiate MFA enrollment with Supabase
 */
export async function initiateMfaEnrollment(supabase: SupabaseClient) {
    const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator App",
    });

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Create MFA challenge
 */
export async function createMfaChallenge(
    supabase: SupabaseClient,
    factorId: string
) {
    const { data, error } = await supabase.auth.mfa.challenge({
        factorId,
    });

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Verify MFA code with Supabase
 */
export async function verifyMfaCode(
    supabase: SupabaseClient,
    code: string,
    factorId: string,
    challengeId: string
) {
    const { data, error } = await supabase.auth.mfa.verify({
        factorId: factorId,
        challengeId: challengeId,
        code,
    });

    if (error) {
        throw error;
    }

    return data;
}

/**
 * List MFA factors for a user
 */
export async function listMfaFactors(supabase: SupabaseClient) {
    const { data, error } = await supabase.auth.mfa.listFactors();

    if (error) {
        throw error;
    }

    return data;
}

/**
 * Unenroll MFA factor
 */
export async function unenrollMfaFactor(
    supabase: SupabaseClient,
    factorId: string
) {
    const { data, error } = await supabase.auth.mfa.unenroll({
        factorId,
    });

    if (error) {
        throw error;
    }

    return data;
}
