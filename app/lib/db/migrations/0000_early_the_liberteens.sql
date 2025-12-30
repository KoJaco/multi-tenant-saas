CREATE TYPE "public"."actions" AS ENUM('create', 'retrieve', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."entity" AS ENUM('account', 'users', 'roles', 'permissions', 'subscriptions', 'billing', 'usage_metrics');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('info', 'success', 'warning', 'error', 'critical');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('owner', 'admin', 'user');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stripe_default_payment_method" text,
	"subscription_status" "subscription_status",
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp,
	"plan" text DEFAULT 'free' NOT NULL,
	"allow_pay_as_you_go" boolean DEFAULT false,
	"billing_currency" text DEFAULT 'AUD',
	"billing_country" text DEFAULT 'AU',
	"tax_exempt" boolean DEFAULT false,
	"seat_quantity" integer DEFAULT 1 NOT NULL,
	"seat_limit" integer,
	"billing_email" text,
	"cancel_at_period_end" boolean DEFAULT false,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "accounts_stripe_customer_id_unique" UNIQUE("stripe_customer_id"),
	CONSTRAINT "accounts_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id"),
	CONSTRAINT "seat_quantity_check" CHECK ("accounts"."seat_quantity" >= 1),
	CONSTRAINT "seat_limit_check" CHECK ("accounts"."seat_limit" IS NULL OR "accounts"."seat_limit" >= 1),
	CONSTRAINT "currency_check" CHECK (upper("accounts"."billing_currency") = "accounts"."billing_currency"),
	CONSTRAINT "country_check" CHECK (upper("accounts"."billing_country") = "accounts"."billing_country")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"account_id" uuid NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"changes" jsonb DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}',
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_balances" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"minute_credits" integer DEFAULT 0 NOT NULL,
	"claim_credits" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"pool" text NOT NULL,
	"direction" text NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"job_id" text,
	"stripe_checkout_session_id" text,
	"stripe_payment_intent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_amount_check" CHECK ("credit_ledger"."amount" > 0),
	CONSTRAINT "credit_ledger_direction_check" CHECK ("credit_ledger"."direction" IN ('credit','debit','reversal')),
	CONSTRAINT "credit_ledger_pool_check" CHECK ("credit_ledger"."pool" IN ('minutes','claims'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid,
	"role_ids" uuid[],
	"type" "notification_type" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_url" text,
	"action_label" text,
	"metadata" jsonb DEFAULT '{}',
	"read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "permission_roles" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "permission_roles_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"entity" "entity",
	"actions" "actions"[],
	"description" text DEFAULT '',
	"is_critical" boolean DEFAULT false,
	"is_owner_only" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "plans_stripe_id_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"interval" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "prices_stripe_id_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "role_users" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "role_users_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"access_level" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_id" text NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"processed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "stripe_webhook_events_stripe_id_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_id" text NOT NULL,
	"subscription_id" uuid NOT NULL,
	"price_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"subscription_status" "subscription_status" NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "subscriptions_stripe_id_unique" UNIQUE("stripe_id")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"audio_seconds" integer DEFAULT 0 NOT NULL,
	"claims_checked" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_seconds_check" CHECK ("usage_counters"."audio_seconds" >= 0),
	CONSTRAINT "claims_checked_check" CHECK ("usage_counters"."claims_checked" >= 0),
	CONSTRAINT "usage_counters_period_bounds_check" CHECK ("usage_counters"."period_start" < "usage_counters"."period_end")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"usage_type" text NOT NULL,
	"quantity" integer NOT NULL,
	"job_id" text NOT NULL,
	"reported_to_stripe" boolean DEFAULT false NOT NULL,
	"reported_meter_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quantity_check" CHECK ("usage_events"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "usage_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"metric_type" text NOT NULL,
	"data" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role_id" uuid NOT NULL,
	"token" text NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settings" jsonb DEFAULT '{}' NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text,
	"avatarBlob" text,
	"bio" text,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"account_id" uuid NOT NULL,
	"email_verified" boolean DEFAULT false,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}',
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_balances" ADD CONSTRAINT "credit_balances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_roles" ADD CONSTRAINT "permission_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_roles" ADD CONSTRAINT "permission_roles_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prices" ADD CONSTRAINT "prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_users" ADD CONSTRAINT "role_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_users" ADD CONSTRAINT "role_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_users" ADD CONSTRAINT "role_users_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_items" ADD CONSTRAINT "subscription_items_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_metrics" ADD CONSTRAINT "usage_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stripe_customer_idx" ON "accounts" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_idx" ON "accounts" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "stripe_sub_status_idx" ON "accounts" USING btree ("subscription_status");--> statement-breakpoint
CREATE INDEX "accounts_deleted_at_idx" ON "accounts" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_account_id_idx" ON "audit_logs" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_type_idx" ON "audit_logs" USING btree ("target_type");--> statement-breakpoint
CREATE INDEX "audit_logs_target_id_idx" ON "audit_logs" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_account_created_at_idx" ON "audit_logs" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_checkout_uidx" ON "credit_ledger" USING btree ("stripe_checkout_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_pi_uidx" ON "credit_ledger" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE INDEX "notifications_account_id_idx" ON "notifications" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_read_idx" ON "notifications" USING btree ("read");--> statement-breakpoint
CREATE INDEX "notifications_type_idx" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_account_read_idx" ON "notifications" USING btree ("account_id","read");--> statement-breakpoint
CREATE INDEX "role_id_idx" ON "permission_roles" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "permission_roles_deleted_at_idx" ON "permission_roles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "unique_entity_action" ON "permissions" USING btree ("entity","actions");--> statement-breakpoint
CREATE INDEX "permissions_account_id_idx" ON "permissions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "permissions_deleted_at_idx" ON "permissions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "plans_stripe_id_idx" ON "plans" USING btree ("stripe_id");--> statement-breakpoint
CREATE INDEX "plans_deleted_at_idx" ON "plans" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "prices_stripe_id_idx" ON "prices" USING btree ("stripe_id");--> statement-breakpoint
CREATE INDEX "prices_plan_id_idx" ON "prices" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "prices_deleted_at_idx" ON "prices" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "role_users_unique_idx" ON "role_users" USING btree ("user_id","role_id");--> statement-breakpoint
CREATE INDEX "user_id_idx" ON "role_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "role_users_deleted_at_idx" ON "role_users" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "unique_role_name_account" ON "roles" USING btree ("name","account_id");--> statement-breakpoint
CREATE INDEX "roles_account_id_idx" ON "roles" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "roles_deleted_at_idx" ON "roles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "subscription_items_deleted_at_idx" ON "subscription_items" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "subscriptions_stripe_id_idx" ON "subscriptions" USING btree ("stripe_id");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_idx" ON "subscriptions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "subscriptions_deleted_at_idx" ON "subscriptions" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "usage_counters_account_id_idx" ON "usage_counters" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_unique_period_source" ON "usage_counters" USING btree ("account_id","source","period_start","period_end");--> statement-breakpoint
CREATE INDEX "usage_events_account_created_at_idx" ON "usage_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_account_kind_idx" ON "usage_events" USING btree ("account_id","usage_type");--> statement-breakpoint
CREATE INDEX "usage_metrics_deleted_at_idx" ON "usage_metrics" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "account_email_idx" ON "user_invitations" USING btree ("account_id","email");--> statement-breakpoint
CREATE INDEX "user_invitations_deleted_at_idx" ON "user_invitations" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "user_preferences_deleted_at_idx" ON "user_preferences" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "user_profiles_deleted_at_idx" ON "user_profiles" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "user_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "user_account_idx" ON "users" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "user_provider_id_idx" ON "users" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "users_deleted_at_idx" ON "users" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_id_idx" ON "webhook_events" USING btree ("event_id","source");--> statement-breakpoint
CREATE INDEX "webhook_events_source_idx" ON "webhook_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "webhook_events_event_type_idx" ON "webhook_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "webhook_events_created_at_idx" ON "webhook_events" USING btree ("created_at");