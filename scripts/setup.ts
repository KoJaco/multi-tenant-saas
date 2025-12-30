#!/usr/bin/env tsx
/**
 * Local Development Setup Script
 *
 * Runs migrations, seeds demo account + users, and seeds Stripe products/prices
 * or fakes them in dev mode.
 *
 * Usage:
 *   npm run setup
 *   or
 *   tsx scripts/setup.ts
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../app/lib/db/schema.js";
import { createClient } from "@supabase/supabase-js";
import { accounts, users, roles, plans, prices } from "../app/lib/db/schema.js";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

// Check environment variables
const requiredEnvVars = ["DATABASE_URL", "SUPABASE_URL", "SUPABASE_SECRET_KEY"];

for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`❌ Error: ${envVar} environment variable is required`);
        process.exit(1);
    }
}

const DATABASE_URL = process.env.DATABASE_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

async function runMigrations() {
    console.log("\n📦 Running database migrations...");
    const migrationClient = postgres(DATABASE_URL, { max: 1 });
    const db = drizzle(migrationClient);

    try {
        await migrate(db, { migrationsFolder: "app/lib/db/migrations" });
        console.log("✅ Migrations completed successfully\n");
    } catch (error: any) {
        console.error("❌ Migration failed:", error.message);
        throw error;
    } finally {
        await migrationClient.end();
    }
}

async function seedStripeProducts() {
    console.log("💳 Seeding Stripe products and prices...");

    const client = postgres(DATABASE_URL);
    const db = drizzle(client, { schema });

    try {
        // Check if products already exist
        const existingPlans = await db.query.plans.findMany();
        if (existingPlans.length > 0) {
            console.log("  ⚠️  Plans already exist, skipping Stripe seeding");
            await client.end();
            return;
        }

        if (STRIPE_SECRET_KEY && STRIPE_SECRET_KEY.startsWith("sk_live")) {
            // Production: Use real Stripe API
            const Stripe = (await import("stripe")).default;
            const stripe = new Stripe(STRIPE_SECRET_KEY, {
                apiVersion: "2025-08-27.basil",
            });

            console.log("  📡 Fetching products from Stripe...");

            const stripeProducts = await stripe.products.list({ limit: 100 });
            const stripePrices = await stripe.prices.list({ limit: 100 });

            for (const product of stripeProducts.data) {
                const [plan] = await db
                    .insert(plans)
                    .values({
                        stripeId: product.id,
                        name: product.name,
                        description: product.description || null,
                        isActive: product.active,
                    })
                    .returning();

                const productPrices = stripePrices.data.filter(
                    (p) => p.product === product.id
                );

                for (const price of productPrices) {
                    await db.insert(prices).values({
                        stripeId: price.id,
                        amount: price.unit_amount || 0,
                        currency: price.currency,
                        interval: price.recurring?.interval || "one_time",
                        planId: plan.id,
                        isActive: price.active,
                    });
                }

                console.log(`  ✓ Created plan: ${plan.name}`);
            }
        } else {
            // Development: Create fake products
            console.log("  🎭 Creating fake Stripe products (dev mode)...");

            const fakePlans = [
                {
                    stripeId: "price_free",
                    name: "Free",
                    description: "Free tier with basic features",
                    prices: [
                        {
                            stripeId: "price_free_monthly",
                            amount: 0,
                            currency: "usd",
                            interval: "month",
                        },
                    ],
                },
                {
                    stripeId: "price_pro",
                    name: "Pro",
                    description: "Professional tier with advanced features",
                    prices: [
                        {
                            stripeId: "price_pro_monthly",
                            amount: 2900, // $29.00
                            currency: "usd",
                            interval: "month",
                        },
                        {
                            stripeId: "price_pro_yearly",
                            amount: 29000, // $290.00
                            currency: "usd",
                            interval: "year",
                        },
                    ],
                },
                {
                    stripeId: "price_enterprise",
                    name: "Enterprise",
                    description: "Enterprise tier with custom features",
                    prices: [
                        {
                            stripeId: "price_enterprise_monthly",
                            amount: 9900, // $99.00
                            currency: "usd",
                            interval: "month",
                        },
                    ],
                },
            ];

            for (const planData of fakePlans) {
                const [plan] = await db
                    .insert(plans)
                    .values({
                        stripeId: planData.stripeId,
                        name: planData.name,
                        description: planData.description,
                        isActive: true,
                    })
                    .returning();

                for (const priceData of planData.prices) {
                    await db.insert(prices).values({
                        stripeId: priceData.stripeId,
                        amount: priceData.amount,
                        currency: priceData.currency,
                        interval: priceData.interval,
                        planId: plan.id,
                        isActive: true,
                    });
                }

                console.log(`  ✓ Created fake plan: ${plan.name}`);
            }
        }

        console.log("✅ Stripe products seeded\n");
    } catch (error: any) {
        console.error("❌ Error seeding Stripe products:", error.message);
        throw error;
    } finally {
        await client.end();
    }
}

async function seedDemoAccount() {
    console.log("👤 Seeding demo account and users...");

    const client = postgres(DATABASE_URL);
    const db = drizzle(client, { schema });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    try {
        // Check if demo account already exists
        const existingAccount = await db.query.accounts.findFirst({
            where: eq(accounts.name, "Demo Account"),
        });

        if (existingAccount) {
            console.log("  ⚠️  Demo account already exists, skipping");
            await client.end();
            return;
        }

        // Create demo account
        const [demoAccount] = await db
            .insert(accounts)
            .values({
                name: "Demo Account",
                plan: "free",
            })
            .returning();

        console.log(`  ✓ Created demo account: ${demoAccount.name}`);

        // Create default roles
        const [ownerRole] = await db
            .insert(roles)
            .values({
                name: "Owner",
                description: "Account owner with full access",
                accessLevel: 2,
                accountId: demoAccount.id,
            })
            .returning();

        const [adminRole] = await db
            .insert(roles)
            .values({
                name: "Admin",
                description: "Administrator with elevated access",
                accessLevel: 1,
                accountId: demoAccount.id,
            })
            .returning();

        const [userRole] = await db
            .insert(roles)
            .values({
                name: "User",
                description: "Regular user with basic access",
                accessLevel: 0,
                accountId: demoAccount.id,
            })
            .returning();

        console.log("  ✓ Created default roles");

        // Create demo users
        const demoUsers = [
            {
                email: "demo@example.com",
                password: "demo123456",
                role: "owner" as const,
            },
            {
                email: "admin@example.com",
                password: "admin123456",
                role: "admin" as const,
            },
            {
                email: "user@example.com",
                password: "user123456",
                role: "user" as const,
            },
        ];

        for (const userData of demoUsers) {
            // Create auth user
            const { data: authUser, error } =
                await supabaseAdmin.auth.admin.createUser({
                    email: userData.email,
                    password: userData.password,
                    email_confirm: true,
                });

            if (error && !error.message.includes("already registered")) {
                console.error(
                    `  ❌ Error creating auth user ${userData.email}:`,
                    error.message
                );
                continue;
            }

            const userId = authUser?.user?.id;
            if (!userId) {
                // User already exists, try to get them
                const { data: existingUsers } =
                    await supabaseAdmin.auth.admin.listUsers();
                const existing = existingUsers?.users.find(
                    (u) => u.email === userData.email
                );
                if (existing) {
                    // Check if user exists in our DB
                    const existingAppUser = await db.query.users.findFirst({
                        where: eq(users.id, existing.id),
                    });
                    if (existingAppUser) {
                        console.log(
                            `  ⚠️  User ${userData.email} already exists, skipping`
                        );
                        continue;
                    }
                    // Create app user for existing auth user
                    await db.insert(users).values({
                        id: existing.id,
                        email: userData.email,
                        provider: "email",
                        accountId: demoAccount.id,
                        role: userData.role,
                        emailVerified: true,
                    });
                    console.log(`  ✓ Created app user: ${userData.email}`);
                }
                continue;
            }

            // Create app user
            await db.insert(users).values({
                id: userId,
                email: userData.email,
                provider: "email",
                accountId: demoAccount.id,
                role: userData.role,
                emailVerified: true,
            });

            console.log(
                `  ✓ Created user: ${userData.email} (${userData.role})`
            );
        }

        console.log("✅ Demo account seeded\n");
        console.log("Demo credentials:");
        for (const userData of demoUsers) {
            console.log(
                `  - ${userData.email} / ${userData.password} (${userData.role})`
            );
        }
        console.log("");
    } catch (error: any) {
        console.error("❌ Error seeding demo account:", error.message);
        throw error;
    } finally {
        await client.end();
    }
}

async function main() {
    console.log("\n🚀 Starting local development setup...\n");

    try {
        await runMigrations();
        await seedStripeProducts();
        await seedDemoAccount();

        console.log("✅ Setup complete!\n");
        console.log("Next steps:");
        console.log("  1. Run 'npm run dev' to start the development server");
        console.log("  2. Visit http://localhost:5173");
        console.log("  3. Log in with demo credentials above\n");
    } catch (error: any) {
        console.error("\n❌ Setup failed:", error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();
