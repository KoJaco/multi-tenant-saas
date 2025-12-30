-- ============================================================================
-- Multi-Tenant RLS Policies for Supabase
-- ============================================================================
-- This script enables Row Level Security (RLS) on all tenant-scoped tables
-- and creates policies that filter data by accountId based on the authenticated
-- user's account membership.
--
-- Usage:
--   1. Run this script in Supabase SQL Editor or via psql
--   2. Ensure migrations have been run first
--   3. Test policies after applying
-- ============================================================================

-- Helper function to get the current user's account_id
-- This function looks up the account_id from the users table based on auth.uid()
-- Excludes soft-deleted users
CREATE OR REPLACE FUNCTION get_user_account_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    account_id_val uuid;
BEGIN
    SELECT account_id INTO account_id_val
    FROM users
    WHERE id = auth.uid()
    AND deleted_at IS NULL;
    
    RETURN account_id_val;
END;
$$;

-- ============================================================================
-- Enable RLS on all tenant-scoped tables
-- ============================================================================

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Note: plans, prices, stripe_webhook_events, and webhook_events do NOT have RLS enabled
-- as they are global/shared data or system-only tables

-- ============================================================================
-- ACCOUNTS TABLE POLICIES
-- ============================================================================

-- Users can only see their own account (excluding soft-deleted accounts)
CREATE POLICY "accounts_select_own"
    ON accounts
    FOR SELECT
    USING (id = get_user_account_id() AND deleted_at IS NULL);

-- Users cannot insert accounts (handled by application logic)
CREATE POLICY "accounts_insert_deny"
    ON accounts
    FOR INSERT
    WITH CHECK (false);

-- Only owners can update their account
CREATE POLICY "accounts_update_own"
    ON accounts
    FOR UPDATE
    USING (
        id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = accounts.id
            AND users.role = 'owner'
        )
    );

-- Users cannot delete accounts (handled by application logic)
CREATE POLICY "accounts_delete_deny"
    ON accounts
    FOR DELETE
    USING (false);

-- ============================================================================
-- USERS TABLE POLICIES
-- ============================================================================

-- Users can see other users in their account (excluding soft-deleted users)
CREATE POLICY "users_select_account"
    ON users
    FOR SELECT
    USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Users cannot insert users directly (handled by application logic)
CREATE POLICY "users_insert_deny"
    ON users
    FOR INSERT
    WITH CHECK (false);

-- Users can update their own record, admins/owners can update others in their account
CREATE POLICY "users_update_own_or_account"
    ON users
    FOR UPDATE
    USING (
        account_id = get_user_account_id()
        AND (
            id = auth.uid()
            OR EXISTS (
                SELECT 1 FROM users u
                WHERE u.id = auth.uid()
                AND u.account_id = users.account_id
                AND u.role IN ('admin', 'owner')
            )
        )
    );

-- Only owners can delete users in their account
CREATE POLICY "users_delete_account_owner"
    ON users
    FOR DELETE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = auth.uid()
            AND u.account_id = users.account_id
            AND u.role = 'owner'
        )
    );

-- ============================================================================
-- ROLES TABLE POLICIES
-- ============================================================================

-- Users can see roles in their account (excluding soft-deleted roles)
CREATE POLICY "roles_select_account"
    ON roles
    FOR SELECT
    USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Only admins/owners can create roles in their account
CREATE POLICY "roles_insert_account_admin"
    ON roles
    FOR INSERT
    WITH CHECK (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = roles.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only admins/owners can update roles in their account
CREATE POLICY "roles_update_account_admin"
    ON roles
    FOR UPDATE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = roles.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only owners can delete roles in their account
CREATE POLICY "roles_delete_account_owner"
    ON roles
    FOR DELETE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = roles.account_id
            AND users.role = 'owner'
        )
    );

-- ============================================================================
-- PERMISSIONS TABLE POLICIES
-- ============================================================================

-- Users can see permissions in their account (excluding soft-deleted permissions)
CREATE POLICY "permissions_select_account"
    ON permissions
    FOR SELECT
    USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Only admins/owners can create permissions in their account
CREATE POLICY "permissions_insert_account_admin"
    ON permissions
    FOR INSERT
    WITH CHECK (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = permissions.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only admins/owners can update permissions in their account
CREATE POLICY "permissions_update_account_admin"
    ON permissions
    FOR UPDATE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = permissions.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only owners can delete permissions in their account
CREATE POLICY "permissions_delete_account_owner"
    ON permissions
    FOR DELETE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = permissions.account_id
            AND users.role = 'owner'
        )
    );

-- ============================================================================
-- ROLE_USERS TABLE POLICIES
-- ============================================================================

-- Users can see role assignments in their account (excluding soft-deleted assignments)
CREATE POLICY "role_users_select_account"
    ON role_users
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = role_users.user_id
            AND u.account_id = get_user_account_id()
            AND u.deleted_at IS NULL
        )
    );

-- Only admins/owners can assign roles in their account
CREATE POLICY "role_users_insert_account_admin"
    ON role_users
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = role_users.user_id
            AND u.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users admin
                WHERE admin.id = auth.uid()
                AND admin.account_id = u.account_id
                AND admin.role IN ('admin', 'owner')
            )
        )
    );

-- Only admins/owners can update role assignments in their account
CREATE POLICY "role_users_update_account_admin"
    ON role_users
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = role_users.user_id
            AND u.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users admin
                WHERE admin.id = auth.uid()
                AND admin.account_id = u.account_id
                AND admin.role IN ('admin', 'owner')
            )
        )
    );

-- Only admins/owners can remove role assignments in their account
CREATE POLICY "role_users_delete_account_admin"
    ON role_users
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = role_users.user_id
            AND u.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users admin
                WHERE admin.id = auth.uid()
                AND admin.account_id = u.account_id
                AND admin.role IN ('admin', 'owner')
            )
        )
    );

-- ============================================================================
-- PERMISSION_ROLES TABLE POLICIES
-- ============================================================================

-- Users can see permission-role mappings in their account (excluding soft-deleted mappings)
CREATE POLICY "permission_roles_select_account"
    ON permission_roles
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM roles r
            WHERE r.id = permission_roles.role_id
            AND r.account_id = get_user_account_id()
            AND r.deleted_at IS NULL
        )
    );

-- Only admins/owners can create permission-role mappings in their account
CREATE POLICY "permission_roles_insert_account_admin"
    ON permission_roles
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM roles r
            WHERE r.id = permission_roles.role_id
            AND r.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users
                WHERE users.id = auth.uid()
                AND users.account_id = r.account_id
                AND users.role IN ('admin', 'owner')
            )
        )
    );

-- Only admins/owners can update permission-role mappings in their account
CREATE POLICY "permission_roles_update_account_admin"
    ON permission_roles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM roles r
            WHERE r.id = permission_roles.role_id
            AND r.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users
                WHERE users.id = auth.uid()
                AND users.account_id = r.account_id
                AND users.role IN ('admin', 'owner')
            )
        )
    );

-- Only admins/owners can delete permission-role mappings in their account
CREATE POLICY "permission_roles_delete_account_admin"
    ON permission_roles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM roles r
            WHERE r.id = permission_roles.role_id
            AND r.account_id = get_user_account_id()
            AND EXISTS (
                SELECT 1 FROM users
                WHERE users.id = auth.uid()
                AND users.account_id = r.account_id
                AND users.role IN ('admin', 'owner')
            )
        )
    );

-- ============================================================================
-- USER_INVITATIONS TABLE POLICIES
-- ============================================================================

-- Users can see invitations for their account (excluding soft-deleted invitations)
CREATE POLICY "user_invitations_select_account"
    ON user_invitations
    FOR SELECT
    USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Only admins/owners can create invitations for their account
CREATE POLICY "user_invitations_insert_account_admin"
    ON user_invitations
    FOR INSERT
    WITH CHECK (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = user_invitations.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only admins/owners can update invitations for their account
CREATE POLICY "user_invitations_update_account_admin"
    ON user_invitations
    FOR UPDATE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = user_invitations.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Only admins/owners can delete invitations for their account
CREATE POLICY "user_invitations_delete_account_admin"
    ON user_invitations
    FOR DELETE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = user_invitations.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- ============================================================================
-- USER_PREFERENCES TABLE POLICIES
-- ============================================================================

-- Users can see their own preferences (excluding soft-deleted preferences)
CREATE POLICY "user_preferences_select_own"
    ON user_preferences
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_preferences.user_id
            AND users.account_id = get_user_account_id()
            AND users.deleted_at IS NULL
        )
    );

-- Users can create their own preferences
CREATE POLICY "user_preferences_insert_own"
    ON user_preferences
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_preferences.user_id
            AND users.account_id = get_user_account_id()
        )
    );

-- Users can update their own preferences
CREATE POLICY "user_preferences_update_own"
    ON user_preferences
    FOR UPDATE
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_preferences.user_id
            AND users.account_id = get_user_account_id()
        )
    );

-- Users can delete their own preferences
CREATE POLICY "user_preferences_delete_own"
    ON user_preferences
    FOR DELETE
    USING (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_preferences.user_id
            AND users.account_id = get_user_account_id()
        )
    );

-- ============================================================================
-- USER_PROFILES TABLE POLICIES
-- ============================================================================

-- Users can see profiles in their account (excluding soft-deleted profiles)
CREATE POLICY "user_profiles_select_account"
    ON user_profiles
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_profiles.user_id
            AND users.account_id = get_user_account_id()
            AND users.deleted_at IS NULL
        )
    );

-- Users can create their own profile
CREATE POLICY "user_profiles_insert_own"
    ON user_profiles
    FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = user_profiles.user_id
            AND users.account_id = get_user_account_id()
        )
    );

-- Users can update their own profile, admins can update any profile in their account
CREATE POLICY "user_profiles_update_own_or_account"
    ON user_profiles
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_profiles.user_id
            AND u.account_id = get_user_account_id()
            AND (
                user_profiles.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM users admin
                    WHERE admin.id = auth.uid()
                    AND admin.account_id = u.account_id
                    AND admin.role IN ('admin', 'owner')
                )
            )
        )
    );

-- Users can delete their own profile, admins can delete any profile in their account
CREATE POLICY "user_profiles_delete_own_or_account"
    ON user_profiles
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = user_profiles.user_id
            AND u.account_id = get_user_account_id()
            AND (
                user_profiles.user_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM users admin
                    WHERE admin.id = auth.uid()
                    AND admin.account_id = u.account_id
                    AND admin.role IN ('admin', 'owner')
                )
            )
        )
    );

-- ============================================================================
-- CREDIT_BALANCES TABLE POLICIES
-- ============================================================================

-- Users can see credit balances for their account
CREATE POLICY "credit_balances_select_account"
    ON credit_balances
    FOR SELECT
    USING (account_id = get_user_account_id());

-- Only system/service role can insert credit balances
CREATE POLICY "credit_balances_insert_deny"
    ON credit_balances
    FOR INSERT
    WITH CHECK (false);

-- Only system/service role can update credit balances
CREATE POLICY "credit_balances_update_deny"
    ON credit_balances
    FOR UPDATE
    USING (false);

-- Users cannot delete credit balances
CREATE POLICY "credit_balances_delete_deny"
    ON credit_balances
    FOR DELETE
    USING (false);

-- ============================================================================
-- CREDIT_LEDGER TABLE POLICIES
-- ============================================================================

-- Users can see credit ledger entries for their account
CREATE POLICY "credit_ledger_select_account"
    ON credit_ledger
    FOR SELECT
    USING (account_id = get_user_account_id());

-- Only system/service role can insert credit ledger entries
CREATE POLICY "credit_ledger_insert_deny"
    ON credit_ledger
    FOR INSERT
    WITH CHECK (false);

-- Users cannot update credit ledger entries
CREATE POLICY "credit_ledger_update_deny"
    ON credit_ledger
    FOR UPDATE
    USING (false);

-- Users cannot delete credit ledger entries
CREATE POLICY "credit_ledger_delete_deny"
    ON credit_ledger
    FOR DELETE
    USING (false);

-- ============================================================================
-- USAGE_COUNTERS TABLE POLICIES
-- ============================================================================

-- Users can see usage counters for their account
CREATE POLICY "usage_counters_select_account"
    ON usage_counters
    FOR SELECT
    USING (account_id = get_user_account_id());

-- Only system/service role can insert usage counters
CREATE POLICY "usage_counters_insert_deny"
    ON usage_counters
    FOR INSERT
    WITH CHECK (false);

-- Only system/service role can update usage counters
CREATE POLICY "usage_counters_update_deny"
    ON usage_counters
    FOR UPDATE
    USING (false);

-- Users cannot delete usage counters
CREATE POLICY "usage_counters_delete_deny"
    ON usage_counters
    FOR DELETE
    USING (false);

-- ============================================================================
-- USAGE_EVENTS TABLE POLICIES
-- ============================================================================

-- Users can see usage events for their account
CREATE POLICY "usage_events_select_account"
    ON usage_events
    FOR SELECT
    USING (account_id = get_user_account_id());

-- Only system/service role can insert usage events
CREATE POLICY "usage_events_insert_deny"
    ON usage_events
    FOR INSERT
    WITH CHECK (false);

-- Only system/service role can update usage events
CREATE POLICY "usage_events_update_deny"
    ON usage_events
    FOR UPDATE
    USING (false);

-- Users cannot delete usage events
CREATE POLICY "usage_events_delete_deny"
    ON usage_events
    FOR DELETE
    USING (false);

-- ============================================================================
-- USAGE_METRICS TABLE POLICIES
-- ============================================================================

-- Users can see usage metrics for users in their account (excluding soft-deleted metrics)
CREATE POLICY "usage_metrics_select_account"
    ON usage_metrics
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = usage_metrics.user_id
            AND users.account_id = get_user_account_id()
            AND users.deleted_at IS NULL
        )
    );

-- Only system/service role can insert usage metrics
CREATE POLICY "usage_metrics_insert_deny"
    ON usage_metrics
    FOR INSERT
    WITH CHECK (false);

-- Users cannot update usage metrics
CREATE POLICY "usage_metrics_update_deny"
    ON usage_metrics
    FOR UPDATE
    USING (false);

-- Users cannot delete usage metrics
CREATE POLICY "usage_metrics_delete_deny"
    ON usage_metrics
    FOR DELETE
    USING (false);

-- ============================================================================
-- SUBSCRIPTIONS TABLE POLICIES
-- ============================================================================

-- Users can see subscriptions for their account (excluding soft-deleted subscriptions)
CREATE POLICY "subscriptions_select_account"
    ON subscriptions
    FOR SELECT
    USING (account_id = get_user_account_id() AND deleted_at IS NULL);

-- Only system/service role can insert subscriptions
CREATE POLICY "subscriptions_insert_deny"
    ON subscriptions
    FOR INSERT
    WITH CHECK (false);

-- Only system/service role can update subscriptions
CREATE POLICY "subscriptions_update_deny"
    ON subscriptions
    FOR UPDATE
    USING (false);

-- Users cannot delete subscriptions
CREATE POLICY "subscriptions_delete_deny"
    ON subscriptions
    FOR DELETE
    USING (false);

-- ============================================================================
-- SUBSCRIPTION_ITEMS TABLE POLICIES
-- ============================================================================

-- Users can see subscription items for subscriptions in their account (excluding soft-deleted items)
CREATE POLICY "subscription_items_select_account"
    ON subscription_items
    FOR SELECT
    USING (
        deleted_at IS NULL
        AND EXISTS (
            SELECT 1 FROM subscriptions s
            WHERE s.id = subscription_items.subscription_id
            AND s.account_id = get_user_account_id()
            AND s.deleted_at IS NULL
        )
    );

-- Only system/service role can insert subscription items
CREATE POLICY "subscription_items_insert_deny"
    ON subscription_items
    FOR INSERT
    WITH CHECK (false);

-- Only system/service role can update subscription items
CREATE POLICY "subscription_items_update_deny"
    ON subscription_items
    FOR UPDATE
    USING (false);

-- Users cannot delete subscription items
CREATE POLICY "subscription_items_delete_deny"
    ON subscription_items
    FOR DELETE
    USING (false);

-- ============================================================================
-- NOTIFICATIONS TABLE POLICIES
-- ============================================================================

-- Users can see notifications for their account (excluding soft-deleted notifications)
-- They can see:
--   1. Notifications directly assigned to them (user_id = auth.uid())
--   2. Role-based notifications where they have one of the roles in role_ids
--   3. Account-wide notifications (both user_id and role_ids are NULL)
CREATE POLICY "notifications_select_account"
    ON notifications
    FOR SELECT
    USING (
        account_id = get_user_account_id()
        AND deleted_at IS NULL
        AND (
            -- Direct user notification
            user_id = auth.uid()
            OR
            -- Role-based notification (user_id IS NULL and user has one of the roles)
            (
                user_id IS NULL
                AND role_ids IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM role_users ru
                    WHERE ru.user_id = auth.uid()
                    AND ru.role_id = ANY(notifications.role_ids)
                    AND ru.deleted_at IS NULL
                )
            )
            OR
            -- Account-wide notification (both user_id and role_ids are NULL)
            (
                user_id IS NULL
                AND (role_ids IS NULL OR array_length(role_ids, 1) IS NULL)
            )
        )
    );

-- Only admins/owners can create notifications for their account
CREATE POLICY "notifications_insert_account_admin"
    ON notifications
    FOR INSERT
    WITH CHECK (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = notifications.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- Users can update notifications (to mark as read/unread)
-- They can update notifications assigned to them, their roles, or account-wide notifications
CREATE POLICY "notifications_update_own"
    ON notifications
    FOR UPDATE
    USING (
        account_id = get_user_account_id()
        AND deleted_at IS NULL
        AND (
            -- Can update own direct notifications
            user_id = auth.uid()
            OR
            -- Can update role-based notifications if they have one of the roles
            (
                user_id IS NULL
                AND role_ids IS NOT NULL
                AND EXISTS (
                    SELECT 1 FROM role_users ru
                    WHERE ru.user_id = auth.uid()
                    AND ru.role_id = ANY(notifications.role_ids)
                    AND ru.deleted_at IS NULL
                )
            )
            OR
            -- Can update account-wide notifications
            (
                user_id IS NULL
                AND (role_ids IS NULL OR array_length(role_ids, 1) IS NULL)
            )
        )
    );

-- Only admins/owners can delete notifications for their account
CREATE POLICY "notifications_delete_account_admin"
    ON notifications
    FOR DELETE
    USING (
        account_id = get_user_account_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.account_id = notifications.account_id
            AND users.role IN ('admin', 'owner')
        )
    );

-- ============================================================================
-- AUDIT_LOGS TABLE POLICIES
-- ============================================================================

-- Users can see audit logs for their account
-- Audit logs are read-only append-only logs
CREATE POLICY "audit_logs_select_account"
    ON audit_logs
    FOR SELECT
    USING (account_id = get_user_account_id());

-- Only system/service role can insert audit logs (append-only)
CREATE POLICY "audit_logs_insert_deny"
    ON audit_logs
    FOR INSERT
    WITH CHECK (false);

-- Users cannot update audit logs (append-only)
CREATE POLICY "audit_logs_update_deny"
    ON audit_logs
    FOR UPDATE
    USING (false);

-- Users cannot delete audit logs (append-only)
CREATE POLICY "audit_logs_delete_deny"
    ON audit_logs
    FOR DELETE
    USING (false);

-- ============================================================================
-- NOTES
-- ============================================================================
-- 1. Plans and Prices tables do NOT have RLS enabled as they are global/shared
-- 2. stripe_webhook_events and webhook_events do NOT have RLS enabled (system-only, accessed via service role)
-- 3. All INSERT/UPDATE/DELETE operations on billing/usage tables are restricted
--    to system/service role - these should be handled by application logic or webhooks
-- 4. Audit logs are append-only - users can only SELECT, all modifications are denied
-- 5. Notifications support both user-specific and role-based notifications
-- 6. The get_user_account_id() function uses SECURITY DEFINER to bypass RLS
--    when looking up the account_id, which is necessary for the policies to work
-- ============================================================================

