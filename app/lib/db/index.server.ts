import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { serverConfig } from "~/lib/config.server";

const client = postgres(serverConfig.DATABASE_URL);
export const db = drizzle(client, { schema });
