/**
 * Database Types
 *
 * TypeScript types inferred from database schema tables.
 * These types are automatically derived from the Drizzle schema definitions.
 */

import {
    users,
    accounts,
    roles,
    roleUsers,
    permissions,
    permissionRoles,
    notifications,
    userInvitations,
    userPreferences,
    userProfiles,
    subscriptions,
    plans,
    prices,
    subscriptionItems,
    stripeWebhookEvents,
    webhookEvents,
    creditBalances,
    creditLedger,
    usageCounters,
    usageEvents,
    usageMetrics,
    auditLogs,
    subscriptionStatusEnum,
    userRoleEnum,
    notificationTypeEnum,
    entityEnum,
    actionEnum,
} from "./schema";

// ============================================================================
// Core User & Account Types
// ============================================================================

/**
 * Application User (inferred from users table)
 * Use this type instead of a generic "User" type
 */
export type AppUser = typeof users.$inferSelect;

/**
 * New user insert type (for creating users)
 */
export type NewAppUser = typeof users.$inferInsert;

/**
 * Account type (inferred from accounts table)
 */
export type Account = typeof accounts.$inferSelect;

/**
 * New account insert type (for creating accounts)
 */
export type NewAccount = typeof accounts.$inferInsert;

// ============================================================================
// Role & Permission Types
// ============================================================================

/**
 * Role type (inferred from roles table)
 */
export type Role = typeof roles.$inferSelect;

/**
 * New role insert type (for creating roles)
 */
export type NewRole = typeof roles.$inferInsert;

/**
 * RoleUser type (inferred from roleUsers table)
 * Represents the many-to-many relationship between users and roles
 */
export type RoleUser = typeof roleUsers.$inferSelect;

/**
 * New roleUser insert type (for assigning roles to users)
 */
export type NewRoleUser = typeof roleUsers.$inferInsert;

/**
 * Permission type (inferred from permissions table)
 */
export type Permission = typeof permissions.$inferSelect;

/**
 * New permission insert type (for creating permissions)
 */
export type NewPermission = typeof permissions.$inferInsert;

/**
 * PermissionRole type (inferred from permissionRoles table)
 * Represents the many-to-many relationship between roles and permissions
 */
export type PermissionRole = typeof permissionRoles.$inferSelect;

/**
 * New permissionRole insert type (for assigning permissions to roles)
 */
export type NewPermissionRole = typeof permissionRoles.$inferInsert;

// ============================================================================
// Notification Types
// ============================================================================

/**
 * Notification type (inferred from notifications table)
 */
export type Notification = typeof notifications.$inferSelect;

/**
 * New notification insert type (for creating notifications)
 */
export type NewNotification = typeof notifications.$inferInsert;

// ============================================================================
// User Invitation & Profile Types
// ============================================================================

/**
 * UserInvitation type (inferred from userInvitations table)
 */
export type UserInvitation = typeof userInvitations.$inferSelect;

/**
 * New userInvitation insert type (for creating invitations)
 */
export type NewUserInvitation = typeof userInvitations.$inferInsert;

/**
 * UserPreferences type (inferred from userPreferences table)
 */
export type UserPreferences = typeof userPreferences.$inferSelect;

/**
 * New userPreferences insert type (for creating preferences)
 */
export type NewUserPreferences = typeof userPreferences.$inferInsert;

/**
 * UserProfile type (inferred from userProfiles table)
 */
export type UserProfile = typeof userProfiles.$inferSelect;

/**
 * New userProfile insert type (for creating profiles)
 */
export type NewUserProfile = typeof userProfiles.$inferInsert;

// ============================================================================
// Subscription & Billing Types
// ============================================================================

/**
 * Subscription type (inferred from subscriptions table)
 */
export type Subscription = typeof subscriptions.$inferSelect;

/**
 * New subscription insert type (for creating subscriptions)
 */
export type NewSubscription = typeof subscriptions.$inferInsert;

/**
 * Plan type (inferred from plans table)
 */
export type Plan = typeof plans.$inferSelect;

/**
 * New plan insert type (for creating plans)
 */
export type NewPlan = typeof plans.$inferInsert;

/**
 * Price type (inferred from prices table)
 */
export type Price = typeof prices.$inferSelect;

/**
 * New price insert type (for creating prices)
 */
export type NewPrice = typeof prices.$inferInsert;

/**
 * SubscriptionItem type (inferred from subscriptionItems table)
 */
export type SubscriptionItem = typeof subscriptionItems.$inferSelect;

/**
 * New subscriptionItem insert type (for creating subscription items)
 */
export type NewSubscriptionItem = typeof subscriptionItems.$inferInsert;

// ============================================================================
// Credit & Usage Types
// ============================================================================

/**
 * CreditBalance type (inferred from creditBalances table)
 */
export type CreditBalance = typeof creditBalances.$inferSelect;

/**
 * New creditBalance insert type (for creating credit balances)
 */
export type NewCreditBalance = typeof creditBalances.$inferInsert;

/**
 * CreditLedger type (inferred from creditLedger table)
 */
export type CreditLedger = typeof creditLedger.$inferSelect;

/**
 * New creditLedger insert type (for creating ledger entries)
 */
export type NewCreditLedger = typeof creditLedger.$inferInsert;

/**
 * UsageCounter type (inferred from usageCounters table)
 */
export type UsageCounter = typeof usageCounters.$inferSelect;

/**
 * New usageCounter insert type (for creating usage counters)
 */
export type NewUsageCounter = typeof usageCounters.$inferInsert;

/**
 * UsageEvent type (inferred from usageEvents table)
 */
export type UsageEvent = typeof usageEvents.$inferSelect;

/**
 * New usageEvent insert type (for creating usage events)
 */
export type NewUsageEvent = typeof usageEvents.$inferInsert;

/**
 * UsageMetric type (inferred from usageMetrics table)
 */
export type UsageMetric = typeof usageMetrics.$inferSelect;

/**
 * New usageMetric insert type (for creating usage metrics)
 */
export type NewUsageMetric = typeof usageMetrics.$inferInsert;

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * WebhookEvent type (inferred from webhookEvents table)
 */
export type WebhookEvent = typeof webhookEvents.$inferSelect;

/**
 * New webhookEvent insert type (for creating webhook events)
 */
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

/**
 * StripeWebhookEvent type (inferred from stripeWebhookEvents table)
 */
export type StripeWebhookEvent = typeof stripeWebhookEvents.$inferSelect;

/**
 * New stripeWebhookEvent insert type (for creating Stripe webhook events)
 */
export type NewStripeWebhookEvent = typeof stripeWebhookEvents.$inferInsert;

// ============================================================================
// Enum Types
// ============================================================================

/**
 * Subscription status enum values
 */
export type SubscriptionStatus =
    (typeof subscriptionStatusEnum.enumValues)[number];

/**
 * User role enum values
 */
export type UserRole = (typeof userRoleEnum.enumValues)[number];

/**
 * Notification type enum values
 */
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

/**
 * Entity enum values
 */
export type Entity = (typeof entityEnum.enumValues)[number];

/**
 * Action enum values
 */
export type Action = (typeof actionEnum.enumValues)[number];

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Type helper for timestamps (createdAt, updatedAt, deletedAt)
 */
export type WithTimestamps<T> = T & {
    createdAt: Date | null;
    updatedAt: Date | null;
    deletedAt: Date | null;
};

/**
 * Type helper for soft-deleted records (excludes deletedAt)
 */
export type WithoutDeleted<T extends { deletedAt: Date | null }> = Omit<
    T,
    "deletedAt"
> & {
    deletedAt: null;
};

// ============================================================================
// Audit Log Types
// ============================================================================

/**
 * AuditLog type (inferred from auditLogs table)
 */
export type AuditLog = typeof auditLogs.$inferSelect;

/**
 * New auditLog insert type (for creating audit logs)
 */
export type NewAuditLog = typeof auditLogs.$inferInsert;
