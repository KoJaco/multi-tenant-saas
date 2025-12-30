ALTER TABLE "users" ADD COLUMN "mfa_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_required_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enrolled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enrolled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_method" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_mfa_at" timestamp with time zone;