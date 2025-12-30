/**
 * Authentication Form Validation Schemas
 *
 * Zod schemas for validating authentication form inputs
 */

import { z } from "zod";

/**
 * Email validation schema
 */
export const emailSchema = z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .max(255, "Email address is too long");

/**
 * Password validation schema
 * Minimum 6 characters (Supabase requirement)
 */
export const passwordSchema = z
    .string()
    .min(1, "Password is required")
    .min(6, "Password must be at least 6 characters long")
    .max(128, "Password is too long");

/**
 * Strong password validation schema
 * For password setup/reset - minimum 8 characters
 */
export const strongPasswordSchema = z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password is too long")
    .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        "Password must contain at least one letter and one number"
    );

/**
 * Login form schema
 */
export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    redirectTo: z.string().optional().default("/dashboard"),
});

/**
 * Signup form schema
 */
export const signupSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    redirectTo: z.string().optional().default("/dashboard"),
});

/**
 * Forgot password form schema
 */
export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

/**
 * Reset password form schema
 */
export const resetPasswordSchema = z
    .object({
        password: strongPasswordSchema,
        confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

/**
 * Setup password form schema (for invitations)
 */
export const setupPasswordSchema = z
    .object({
        password: strongPasswordSchema,
        confirmPassword: z.string().min(1, "Please confirm your password"),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

/**
 * Resend confirmation email schema
 */
export const resendConfirmationSchema = z.object({
    email: emailSchema,
});

/**
 * OTP verification schema
 */
export const verifyOtpSchema = z.object({
    email: emailSchema,
    token: z
        .string()
        .min(1, "OTP token is required")
        .length(8, "OTP token must be 6 digits"),
    type: z.enum(["recovery", "email", "signup", "magiclink", "invite"]),
});

/**
 * Validate form data against a schema
 * Returns parsed data or throws with formatted error
 */
export function validateFormData<T extends z.ZodTypeAny>(
    schema: T,
    formData: FormData
): z.infer<T> {
    const data = Object.fromEntries(formData);
    return schema.parse(data);
}

/**
 * Safe validation that returns error instead of throwing
 */
export function safeValidateFormData<T extends z.ZodTypeAny>(
    schema: T,
    formData: FormData
): { success: true; data: z.infer<T> } | { success: false; error: string } {
    try {
        const data = Object.fromEntries(formData);
        const parsed = schema.parse(data);
        return { success: true, data: parsed };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const firstError = error.errors[0];
            return {
                success: false,
                error: firstError?.message || "Invalid form data",
            };
        }
        return {
            success: false,
            error: "Validation failed. Please check your input.",
        };
    }
}
