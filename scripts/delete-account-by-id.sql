-- ============================================================================
-- Delete Account by ID SQL Script
-- ============================================================================
-- 
-- This script deletes an account and all associated data by account_id.
-- It follows the same deletion order as remove-test-rls-policies-data.ts
-- to ensure proper cleanup of all related records.
--
-- Usage:
--   1. Edit the account_uuid variable below (line ~30)
--   2. Run: psql $DATABASE_URL -f scripts/delete-account-by-id.sql
--
-- Example:
--   Change: account_uuid uuid := '123e4567-e89b-12d3-a456-426614174000'::uuid;
--   Then run: psql $DATABASE_URL -f scripts/delete-account-by-id.sql
--
-- WARNING: This will permanently delete the account and all associated data!
-- ============================================================================

-- Start transaction
BEGIN;

-- Create temp table to store account_uuid for use across DO blocks
CREATE TEMP TABLE IF NOT EXISTS _delete_account_params (
    account_uuid uuid PRIMARY KEY
);

-- ============================================================================
-- Initialize: Set account_uuid and validate account exists
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid := '0cca0f36-2570-4ace-ae19-698be72f4f35'::uuid; -- CHANGE THIS UUID
    account_name text;
    user_count int;
BEGIN
    IF account_uuid IS NULL OR account_uuid::text = '' THEN
        RAISE EXCEPTION 'account_id parameter is required. Provide a UUID.';
    END IF;

    -- Store in temp table for other DO blocks
    INSERT INTO _delete_account_params (account_uuid) VALUES (account_uuid)
    ON CONFLICT (account_uuid) DO UPDATE SET account_uuid = EXCLUDED.account_uuid;

    SELECT name INTO account_name FROM accounts WHERE id = account_uuid;

    IF account_name IS NULL THEN
        RAISE EXCEPTION 'Account with id % does not exist', account_uuid;
    END IF;

    SELECT COUNT(*) INTO user_count FROM users WHERE account_id = account_uuid;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'Deleting Account: %', account_name;
    RAISE NOTICE 'Account ID: %', account_uuid;
    RAISE NOTICE 'Users in account: %', user_count;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- Step 1: Delete role user assignments
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM role_users
    WHERE user_id IN (
        SELECT id FROM users WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % role user assignment(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 2: Get role IDs for this account
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    role_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT COUNT(*) INTO role_count
    FROM roles
    WHERE account_id = account_uuid;
    
    RAISE NOTICE 'Found % role(s) for account', role_count;
END $$;

-- ============================================================================
-- Step 3: Get permission IDs for this account
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    permission_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT COUNT(*) INTO permission_count
    FROM permissions
    WHERE account_id = account_uuid;
    
    RAISE NOTICE 'Found % permission(s) for account', permission_count;
END $$;

-- ============================================================================
-- Step 4: Delete permission-role mappings
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM permission_roles
    WHERE role_id IN (
        SELECT id FROM roles WHERE account_id = account_uuid
    )
    OR permission_id IN (
        SELECT id FROM permissions WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % permission-role mapping(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 5: Delete roles
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM roles
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % role(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 6: Delete permissions
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM permissions
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % permission(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 7: Delete user invitations
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM user_invitations
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % user invitation(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 8: Delete user preferences
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM user_preferences
    WHERE user_id IN (
        SELECT id FROM users WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % user preference(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 9: Delete user profiles
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM user_profiles
    WHERE user_id IN (
        SELECT id FROM users WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % user profile(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 10: Delete credit balances
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM credit_balances
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % credit balance(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 11: Delete credit ledger entries
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM credit_ledger
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % credit ledger entrie(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 12: Delete usage counters
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM usage_counters
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % usage counter(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 13: Delete usage events
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM usage_events
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % usage event(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 14: Delete usage metrics
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM usage_metrics
    WHERE user_id IN (
        SELECT id FROM users WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % usage metric(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 15: Get subscription IDs for this account
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    subscription_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT COUNT(*) INTO subscription_count
    FROM subscriptions
    WHERE account_id = account_uuid;
    
    RAISE NOTICE 'Found % subscription(s) for account', subscription_count;
END $$;

-- ============================================================================
-- Step 16: Delete subscription items
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM subscription_items
    WHERE subscription_id IN (
        SELECT id FROM subscriptions WHERE account_id = account_uuid
    );
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % subscription item(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 17: Delete subscriptions
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM subscriptions
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % subscription(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 18: Delete notifications
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM notifications
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % notification(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 19: Delete audit logs
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM audit_logs
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE 'Deleted % audit log(s)', deleted_count;
END $$;

-- ============================================================================
-- Step 20: Get user IDs before deletion (for Supabase auth cleanup)
-- ============================================================================
-- Note: You'll need to manually delete users from Supabase Auth
-- using the Supabase Admin API or dashboard after running this script
DO $$
DECLARE
    account_uuid uuid;
    user_count int;
    user_rec RECORD;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT COUNT(*) INTO user_count
    FROM users
    WHERE account_id = account_uuid;
    
    RAISE NOTICE 'Found % user(s) to delete', user_count;
    RAISE NOTICE '';
    RAISE NOTICE 'User IDs to delete from Supabase Auth:';
    
    FOR user_rec IN
        SELECT id, email FROM users WHERE account_id = account_uuid
    LOOP
        RAISE NOTICE '  - % (%)', user_rec.email, user_rec.id;
    END LOOP;
END $$;

-- ============================================================================
-- Step 21: Delete users
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    DELETE FROM users
    WHERE account_id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RAISE NOTICE '';
    RAISE NOTICE 'Deleted % user(s) from database', deleted_count;
    RAISE NOTICE 'IMPORTANT: You must manually delete these users from Supabase Auth';
    RAISE NOTICE '  using the Supabase Admin API or dashboard';
END $$;

-- ============================================================================
-- Step 22: Delete account (last, as everything depends on it)
-- ============================================================================
DO $$
DECLARE
    account_uuid uuid;
    deleted_count int;
    account_name text;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT name INTO account_name FROM accounts WHERE id = account_uuid;
    
    DELETE FROM accounts
    WHERE id = account_uuid;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    IF deleted_count > 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Successfully deleted account: %', account_name;
        RAISE NOTICE 'Account ID: %', account_uuid;
        RAISE NOTICE '========================================';
    ELSE
        RAISE WARNING 'No account was deleted. Account may not exist.';
    END IF;
END $$;

-- Commit transaction
COMMIT;

-- Final verification
DO $$
DECLARE
    account_uuid uuid;
    remaining_count int;
BEGIN
    SELECT account_uuid INTO account_uuid FROM _delete_account_params LIMIT 1;
    
    SELECT COUNT(*) INTO remaining_count
    FROM accounts
    WHERE id = account_uuid;
    
    IF remaining_count > 0 THEN
        RAISE WARNING 'Account still exists after deletion attempt!';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE 'Account deletion completed successfully!';
    END IF;
END $$;

