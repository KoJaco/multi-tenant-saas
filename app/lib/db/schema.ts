import {
    pgTable,
    text,
    timestamp,
    uuid,
    boolean,
    index,
    jsonb,
    pgEnum,
    integer,
    primaryKey,
    numeric,
    uniqueIndex,
    check,
    smallserial,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// Standard timestamp columns for soft-delete support
export const timestamps = {
    createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
};

export const subscriptionStatusEnum = pgEnum("subscription_status", [
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
]);

export const userRoleEnum = pgEnum("user_role", [
    "owner", // Account owner with full permissions
    "admin", // Can manage users and settings
    "user", // Regular user with basic access
]);

export const notificationTypeEnum = pgEnum("notification_type", [
    "info", // general info (task update, role assignment, etc)
    "success", // positive actions (task complete, etc)
    "warning", // potential issues
    "error", // errors or critical alerts
    "critical", // high-priority critical alerts
]);

export const entityEnum = pgEnum("entity", [
    "account",
    "users",
    "roles",
    "permissions",
    "subscriptions",
    "billing",
    "usage_metrics",
    "audit_logs",
]);

export const actionEnum = pgEnum("actions", [
    "create",
    "retrieve",
    "update",
    "delete",
]);

// Users table
export const users = pgTable(
    "users",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        email: text("email").notNull().unique(),
        provider: text("provider").notNull(),
        providerId: text("provider_id"),
        role: userRoleEnum("role").notNull().default("user"),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        emailVerified: boolean("email_verified").default(false),
        lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
        // MFA fields
        mfaRequired: boolean("mfa_required").notNull().default(false),
        mfaRequiredReason: text("mfa_required_reason"),
        mfaEnrolled: boolean("mfa_enrolled").notNull().default(false),
        mfaEnrolledAt: timestamp("mfa_enrolled_at", { withTimezone: true }),
        mfaMethod: text("mfa_method"),
        lastMfaAt: timestamp("last_mfa_at", { withTimezone: true }),
        ...timestamps,
    },
    (table) => ({
        userEmailIdx: index("user_email_idx").on(table.email),
        userAccountIdx: index("user_account_idx").on(table.accountId),
        userProviderIdIdx: index("user_provider_id_idx").on(table.providerId),
        deletedAtIdx: index("users_deleted_at_idx").on(table.deletedAt),
    })
);

// Accounts table
export const accounts = pgTable(
    "accounts",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        name: text("name").notNull(),
        stripeDefaultPaymentMethod: text("stripe_default_payment_method"),
        subscriptionStatus: subscriptionStatusEnum("subscription_status"),
        stripeCustomerId: text("stripe_customer_id").unique(),
        stripeSubscriptionId: text("stripe_subscription_id").unique(),
        trialEndsAt: timestamp("trial_ends_at"),
        plan: text().default("free").notNull(),
        allowPayAsYouGo: boolean("allow_pay_as_you_go").default(false),
        billingCurrency: text("billing_currency").default("AUD"),
        billingCountry: text("billing_country").default("AU"),
        taxExempt: boolean("tax_exempt").default(false),
        seatQuantity: integer("seat_quantity").default(1).notNull(),
        seatLimit: integer("seat_limit"),
        billingEmail: text("billing_email"),
        cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
        currentPeriodStart: timestamp("current_period_start"),
        currentPeriodEnd: timestamp("current_period_end"),
        ...timestamps,
    },
    (table) => ({
        stripeCustomerIdx: index("stripe_customer_idx").on(
            table.stripeCustomerId
        ),
        stripeSubIdx: index("stripe_sub_idx").on(table.stripeSubscriptionId),
        stripeSubStatusIdx: index("stripe_sub_status_idx").on(
            table.subscriptionStatus
        ),
        deletedAtIdx: index("accounts_deleted_at_idx").on(table.deletedAt),
        seatQuantityCheck: check(
            "seat_quantity_check",
            sql`${table.seatQuantity} >= 1`
        ),
        seatLimitCheck: check(
            "seat_limit_check",
            sql`${table.seatLimit} IS NULL OR ${table.seatLimit} >= 1`
        ),
        currencyCheck: check(
            "currency_check",
            sql`upper(${table.billingCurrency}) = ${table.billingCurrency}`
        ),
        countryCheck: check(
            "country_check",
            sql`upper(${table.billingCountry}) = ${table.billingCountry}`
        ),
    })
);

/** Fast-read running balances per account */
export const creditBalances = pgTable("credit_balances", {
    accountId: uuid("account_id")
        .primaryKey()
        .references(() => accounts.id, { onDelete: "cascade" }),
    minuteCredits: integer("minute_credits").notNull().default(0),
    claimCredits: integer("claim_credits").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
        .notNull()
        .defaultNow(),
});

/** Append-only ledger to audit all credit movements */
export const creditLedger = pgTable(
    "credit_ledger",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),

        /** 'minutes' | 'claims' */
        pool: text("pool").notNull(),
        /** 'credit' | 'debit' | 'reversal' */
        direction: text("direction").notNull(),
        amount: integer("amount").notNull(), // positive integer

        reason: text("reason").notNull(), // e.g. 'topup', 'usage:audio', 'usage:claims', 'refund', 'dispute_freeze'
        jobId: text("job_id"), // optional: link to processing job

        // Idempotency / traceability
        stripeCheckoutSessionId: text("stripe_checkout_session_id"),
        stripePaymentIntentId: text("stripe_payment_intent_id"),

        createdAt: timestamp("created_at", { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (t) => ({
        // Ensure we don't double-credit on webhook retries
        uniqBySession: uniqueIndex("credit_ledger_checkout_uidx").on(
            t.stripeCheckoutSessionId
        ),
        uniqByPi: uniqueIndex("credit_ledger_pi_uidx").on(
            t.stripePaymentIntentId
        ),
        // Basic checks
        amountCheck: check("credit_ledger_amount_check", sql`${t.amount} > 0`),
        directionCheck: check(
            "credit_ledger_direction_check",
            sql`${t.direction} IN ('credit','debit','reversal')`
        ),
        poolCheck: check(
            "credit_ledger_pool_check",
            sql`${t.pool} IN ('minutes','claims')`
        ),
    })
);

export const usageCounters = pgTable(
    "usage_counters",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),

        periodStart: timestamp("period_start", {
            withTimezone: true,
        }).notNull(),
        periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),

        audioSeconds: integer("audio_seconds").notNull().default(0),
        claimsChecked: integer("claims_checked").notNull().default(0),

        source: text("source").notNull(),

        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
        updatedAt: timestamp("updated_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        accountIdIdx: index("usage_counters_account_id_idx").on(
            table.accountId
        ),
        uniquePeriodSource: uniqueIndex(
            "usage_counters_unique_period_source"
        ).on(table.accountId, table.source, table.periodStart, table.periodEnd),
        audioSecondsCheck: check(
            "audio_seconds_check",
            sql`${table.audioSeconds} >= 0`
        ),
        claimsCheckedCheck: check(
            "claims_checked_check",
            sql`${table.claimsChecked} >= 0`
        ),
        periodBoundsCheck: check(
            "usage_counters_period_bounds_check",
            sql`${table.periodStart} < ${table.periodEnd}`
        ),
    })
);

export const usageEvents = pgTable(
    "usage_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),

        usageType: text("usage_type").notNull(), // should really be an enum
        quantity: integer("quantity").notNull(),

        jobId: text("job_id").notNull(),

        reportedToStripe: boolean("reported_to_stripe")
            .notNull()
            .default(false),

        reportedMeterEventId: text("reported_meter_event_id"),

        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        accountCreatedAtIdx: index("usage_events_account_created_at_idx").on(
            table.accountId,
            table.createdAt
        ),
        accountKindIdx: index("usage_events_account_kind_idx").on(
            table.accountId,
            table.usageType
        ),
        quantityCheck: check("quantity_check", sql`${table.quantity} > 0`),
    })
);

// User invitations
export const userInvitations = pgTable(
    "user_invitations",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        roleId: uuid("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }),
        token: text("token").notNull().unique(),
        invitedBy: uuid("invited_by")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        status: text("status", { enum: ["pending", "accepted", "cancelled"] })
            .notNull()
            .default("pending"),
        ...timestamps,
    },
    (table) => ({
        accountEmailIdx: index("account_email_idx").on(
            table.accountId,
            table.email
        ),
        deletedAtIdx: index("user_invitations_deleted_at_idx").on(
            table.deletedAt
        ),
    })
);

export const userPreferences = pgTable(
    "user_preferences",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        settings: jsonb("settings").notNull().default("{}"),
        userId: uuid("user_id")
            .notNull()
            .unique()
            .references(() => users.id, { onDelete: "cascade" }),
        ...timestamps,
    },
    (table) => ({
        deletedAtIdx: index("user_preferences_deleted_at_idx").on(
            table.deletedAt
        ),
    })
);

export const userProfiles = pgTable(
    "user_profiles",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        fullName: text("full_name"),
        avatarBlob: text("avatarBlob"),
        bio: text("bio"),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        ...timestamps,
    },
    (table) => ({
        deletedAtIdx: index("user_profiles_deleted_at_idx").on(table.deletedAt),
    })
);

// Relations
export const usersRelations = relations(users, ({ one }) => ({
    account: one(accounts, {
        fields: [users.accountId],
        references: [accounts.id],
    }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
    users: many(users),
    subscriptions: many(subscriptions),
}));

export const userInvitationsRelations = relations(
    userInvitations,
    ({ one }) => ({
        account: one(accounts, {
            fields: [userInvitations.accountId],
            references: [accounts.id],
        }),
        invitedByUser: one(users, {
            fields: [userInvitations.invitedBy],
            references: [users.id],
        }),
    })
);

// * * * * * * * * *
// Role-based Tables
// * * * * * * * * *

// Roles table
export const roles = pgTable(
    "roles",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),

        // Foreign key to 'accounts.id' (Many-to-one relationship)
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id),

        name: text("name").notNull(),
        description: text("description").default(""),
        accessLevel: integer("access_level").notNull(), // do not allow entities that are lower in the hierarchy to access data in entities that are higher... 'owner', 'admin', 'user'

        ...timestamps,
    },
    (table) => ({
        uniqueRoleNameAccount: index("unique_role_name_account").on(
            table.name,
            table.accountId
        ),
        accountIdIndex: index("roles_account_id_idx").on(table.accountId),
        deletedAtIdx: index("roles_deleted_at_idx").on(table.deletedAt),
    })
);

// RoleUsers table
export const roleUsers = pgTable(
    "role_users",
    {
        // Foreign key to 'users.id'
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id),

        // Foreign key to 'roles.id'
        roleId: uuid("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }), // when a role is deleted, remove the related role-user assignment

        assignedBy: uuid("assigned_by").references(() => users.id),

        assignedAt: timestamp("assigned_at", {
            withTimezone: true,
        }).defaultNow(),

        ...timestamps,
    },
    (table) => ({
        // Composite primary key to prevent duplicate role assignments
        pk: primaryKey({
            columns: [table.userId, table.roleId],
        }),
        uniqueConstraint: index("role_users_unique_idx").on(
            table.userId,
            table.roleId
        ),
        // speed up has_permission() check
        userIdIndex: index("user_id_idx").on(table.userId),
        deletedAtIdx: index("role_users_deleted_at_idx").on(table.deletedAt),
    })
);

// Permissions table
export const permissions = pgTable(
    "permissions",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, {
                onDelete: "cascade",
            }),
        entity: entityEnum("entity"),
        actions: actionEnum("actions").array(),
        description: text("description").default(""),
        isCritical: boolean("is_critical").default(false),
        isOwnerOnly: boolean("is_owner_only").default(false), // Only visible to owners
        ...timestamps,
    },
    (table) => ({
        accountIdIndex: index("permissions_account_id_idx").on(table.accountId),
        deletedAtIdx: index("permissions_deleted_at_idx").on(table.deletedAt),
    })
);

// RolePermissions Many-to-many table
export const permissionRoles = pgTable(
    "permission_roles",
    {
        // Foreign key to 'roles.id' (Many-to-one relationship)
        roleId: uuid("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }),

        // Foreign key to 'permissions.id' (Many-to-one relationship)
        permissionId: uuid("permission_id")
            .notNull()
            .references(() => permissions.id),

        ...timestamps,
    },
    (table) => ({
        pk: primaryKey({ columns: [table.roleId, table.permissionId] }),
        roleIdIndex: index("role_id_idx").on(table.roleId),
        deletedAtIdx: index("permission_roles_deleted_at_idx").on(
            table.deletedAt
        ),
    })
);

// Role-based relations
export const rolesRelations = relations(roles, ({ one, many }) => ({
    // Many-to-one relationship to accounts
    account: one(accounts, {
        fields: [roles.accountId],
        references: [accounts.id],
    }),

    // One-to-many relationship with rolePermissions
    rolePermissions: many(permissionRoles),

    // One-to-many relationship with roleUsers
    roleUsers: many(roleUsers),
}));

export const roleUsersRelations = relations(roleUsers, ({ one }) => ({
    // User assigned the role
    user: one(users, {
        fields: [roleUsers.userId],
        references: [users.id],
    }),

    // Role assigned to the user
    role: one(roles, {
        fields: [roleUsers.roleId],
        references: [roles.id],
    }),

    // User who assigned the role (optional)
    assignedByUser: one(users, {
        fields: [roleUsers.assignedBy],
        references: [users.id],
    }),
}));

export const permissionsRelations = relations(permissions, ({ one, many }) => ({
    // One-to-many relationship with rolePermissions
    permissionRoles: many(permissionRoles),

    // Many-to-one relationship to accounts
    account: one(accounts, {
        fields: [permissions.accountId],
        references: [accounts.id],
    }),
}));

export const permissionRolesRelations = relations(
    permissionRoles,
    ({ one }) => ({
        // Many-to-one relationship to roles
        role: one(roles, {
            fields: [permissionRoles.roleId],
            references: [roles.id],
        }),

        // Many-to-one relationship to permissions
        permission: one(permissions, {
            fields: [permissionRoles.permissionId],
            references: [permissions.id],
        }),
    })
);

// Stripe Tables
export const plans = pgTable(
    "plans",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        stripeId: text("stripe_id").notNull().unique(),
        name: text("name").notNull(),
        description: text("description"),
        isActive: boolean("is_active").default(true),
        ...timestamps,
    },
    (table) => ({
        plansStripeIdIdx: index("plans_stripe_id_idx").on(table.stripeId),
        deletedAtIdx: index("plans_deleted_at_idx").on(table.deletedAt),
    })
);

export const prices = pgTable(
    "prices",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        stripeId: text("stripe_id").notNull().unique(),
        amount: integer("amount").notNull(),
        currency: text("currency").notNull(),
        interval: text("interval").notNull(),
        planId: uuid("plan_id")
            .notNull()
            .references(() => plans.id),
        isActive: boolean("is_active").default(true),
        ...timestamps,
    },
    (table) => ({
        pricesStripeIdIdx: index("prices_stripe_id_idx").on(table.stripeId),
        pricesPlanIdIdx: index("prices_plan_id_idx").on(table.planId),
        deletedAtIdx: index("prices_deleted_at_idx").on(table.deletedAt),
    })
);

export const subscriptions = pgTable(
    "subscriptions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        stripeId: text("stripe_id").notNull().unique(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id),
        planId: uuid("plan_id")
            .notNull()
            .references(() => plans.id),
        status: subscriptionStatusEnum("subscription_status").notNull(),
        currentPeriodStart: timestamp("current_period_start").notNull(),
        currentPeriodEnd: timestamp("current_period_end").notNull(),
        cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
        ...timestamps,
    },
    (table) => ({
        subscriptionsStripeIdIdx: index("subscriptions_stripe_id_idx").on(
            table.stripeId
        ),
        subscriptionsAccountIdIdx: index("subscriptions_account_id_idx").on(
            table.accountId
        ),
        deletedAtIdx: index("subscriptions_deleted_at_idx").on(table.deletedAt),
    })
);

export const subscriptionItems = pgTable(
    "subscription_items",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        stripe_id: text("stripe_id").notNull(),
        subscriptionId: uuid("subscription_id")
            .notNull()
            .references(() => subscriptions.id),
        priceId: uuid("price_id")
            .notNull()
            .references(() => prices.id),
        quantity: integer("quantity").default(1).notNull(),
        ...timestamps,
    },
    (table) => ({
        deletedAtIdx: index("subscription_items_deleted_at_idx").on(
            table.deletedAt
        ),
    })
);

export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
    id: uuid("id")
        .primaryKey()
        .default(sql`gen_random_uuid()`),
    stripeId: text("stripe_id").notNull().unique(),
    type: text("type").notNull(),
    data: jsonb("data").notNull(),
    processed: boolean("processed").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Stripe-based relations
export const plansRelations = relations(plans, ({ many }) => ({
    prices: many(prices),
    subscriptions: many(subscriptions),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
    plan: one(plans, {
        fields: [prices.planId],
        references: [plans.id],
    }),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
    account: one(accounts, {
        fields: [subscriptions.accountId],
        references: [accounts.id],
    }),
    plan: one(plans, {
        fields: [subscriptions.planId],
        references: [plans.id],
    }),
}));

export const subscriptionItemsRelations = relations(
    subscriptionItems,
    ({ one }) => ({
        subscription: one(subscriptions, {
            fields: [subscriptionItems.subscriptionId],
            references: [subscriptions.id],
        }),
        price: one(prices, {
            fields: [subscriptionItems.priceId],
            references: [prices.id],
        }),
    })
);

// Metrics
export const usageMetrics = pgTable(
    "usage_metrics",
    {
        id: uuid("id")
            .primaryKey()
            .default(sql`gen_random_uuid()`),
        userId: uuid("user_id").references(() => users.id),
        metricType: text("metric_type").notNull(),
        data: jsonb("data").default("{}"),
        ...timestamps,
    },
    (table) => ({
        deletedAtIdx: index("usage_metrics_deleted_at_idx").on(table.deletedAt),
    })
);

// Metrics-related relations
export const usageMetricsRelations = relations(usageMetrics, ({ one }) => ({
    user: one(users, {
        fields: [usageMetrics.userId],
        references: [users.id],
    }),
}));

// Webhook Events (for idempotency)
export const webhookEvents = pgTable(
    "webhook_events",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        eventId: text("event_id").notNull(), // Unique identifier from webhook provider
        source: text("source").notNull(), // e.g., "stripe", "app", "custom"
        eventType: text("event_type").notNull(), // e.g., "checkout.session.completed"
        processed: boolean("processed").notNull().default(false),
        processedAt: timestamp("processed_at", { withTimezone: true }),
        payload: jsonb("payload").notNull(), // Full webhook payload
        metadata: jsonb("metadata").default("{}"), // Additional metadata
        error: text("error"), // Error message if processing failed
        retryCount: integer("retry_count").notNull().default(0),
        ...timestamps,
    },
    (table) => ({
        eventIdIdx: uniqueIndex("webhook_events_event_id_idx").on(
            table.eventId,
            table.source
        ), // Unique per source
        sourceIdx: index("webhook_events_source_idx").on(table.source),
        eventTypeIdx: index("webhook_events_event_type_idx").on(
            table.eventType
        ),
        processedIdx: index("webhook_events_processed_idx").on(table.processed),
        createdAtIdx: index("webhook_events_created_at_idx").on(
            table.createdAt
        ),
    })
);

// Webhook events relations
export const webhookEventsRelations = relations(webhookEvents, ({ one }) => ({
    // Add relations here if needed (e.g., to accounts, users, etc.)
}));

// Notifications table
export const notifications = pgTable(
    "notifications",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        userId: uuid("user_id").references(() => users.id, {
            onDelete: "cascade",
        }), // null = role-based notification
        roleIds: uuid("role_ids").array(), // Array of role IDs for role-based notifications
        type: notificationTypeEnum("type").notNull(),
        title: text("title").notNull(),
        message: text("message").notNull(),
        actionUrl: text("action_url"), // Optional URL for action button
        actionLabel: text("action_label"), // Optional label for action button
        metadata: jsonb("metadata").default("{}"), // Additional data
        read: boolean("read").notNull().default(false),
        readAt: timestamp("read_at", { withTimezone: true }),
        ...timestamps,
    },
    (table) => ({
        accountIdIdx: index("notifications_account_id_idx").on(table.accountId),
        userIdIdx: index("notifications_user_id_idx").on(table.userId),
        readIdx: index("notifications_read_idx").on(table.read),
        typeIdx: index("notifications_type_idx").on(table.type),
        createdAtIdx: index("notifications_created_at_idx").on(table.createdAt),
        // Composite index for user notifications query
        userReadIdx: index("notifications_user_read_idx").on(
            table.userId,
            table.read
        ),
        // Composite index for account notifications query
        accountReadIdx: index("notifications_account_read_idx").on(
            table.accountId,
            table.read
        ),
    })
);

// Notifications relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
    account: one(accounts, {
        fields: [notifications.accountId],
        references: [accounts.id],
    }),
    user: one(users, {
        fields: [notifications.userId],
        references: [users.id],
    }),
}));

// Audit Logs table
export const auditLogs = pgTable(
    "audit_logs",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        actorUserId: uuid("actor_user_id").references(() => users.id, {
            onDelete: "set null",
        }), // null for system actions
        accountId: uuid("account_id")
            .notNull()
            .references(() => accounts.id, { onDelete: "cascade" }),
        action: text("action").notNull(), // e.g., "user.created", "account.updated", "role.deleted"
        targetType: text("target_type").notNull(), // e.g., "users", "accounts", "roles"
        targetId: uuid("target_id"), // ID of the target entity (nullable for account-level actions)
        changes: jsonb("changes").default("{}"), // JSON diff of changes (before/after)
        metadata: jsonb("metadata").default("{}"), // Additional context (IP address, user agent, etc.)
        ipAddress: text("ip_address"), // IP address of the actor
        userAgent: text("user_agent"), // User agent string
        createdAt: timestamp("created_at", { withTimezone: true })
            .defaultNow()
            .notNull(),
    },
    (table) => ({
        actorUserIdIdx: index("audit_logs_actor_user_id_idx").on(
            table.actorUserId
        ),
        accountIdIdx: index("audit_logs_account_id_idx").on(table.accountId),
        targetTypeIdx: index("audit_logs_target_type_idx").on(table.targetType),
        targetIdIdx: index("audit_logs_target_id_idx").on(table.targetId),
        actionIdx: index("audit_logs_action_idx").on(table.action),
        createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
        // Composite index for common queries
        accountCreatedAtIdx: index("audit_logs_account_created_at_idx").on(
            table.accountId,
            table.createdAt
        ),
    })
);

// Audit logs relations
export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
    actor: one(users, {
        fields: [auditLogs.actorUserId],
        references: [users.id],
    }),
    account: one(accounts, {
        fields: [auditLogs.accountId],
        references: [accounts.id],
    }),
}));
