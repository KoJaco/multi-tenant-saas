import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
}

const runMigrations = async () => {
    const migrationClient = postgres(process.env.DATABASE_URL as string, {
        max: 1,
    });
    const db = drizzle(migrationClient);

    try {
        await migrate(db, { migrationsFolder: "app/lib/db/migrations" });
        console.log("Migrations completed successfully");
    } catch (error) {
        console.error("Migration failed:", error);
        throw error;
    } finally {
        await migrationClient.end();
    }
};

runMigrations();
