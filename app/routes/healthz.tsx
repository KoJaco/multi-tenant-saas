/**
 * Health Check Endpoint
 * 
 * Lightweight health check that returns 200 OK if the server is running.
 * No database or external service checks - used by load balancers for liveness probes.
 * 
 * GET /healthz
 */

import { type LoaderFunctionArgs } from "react-router";
import { initRequestContext, withRequestContext } from "~/lib/request-context.server";
import { jsonWithRequestId } from "~/lib/middleware.server";

export async function loader({ request }: LoaderFunctionArgs) {
    const context = initRequestContext(request);
    
    return withRequestContext(context, async () => {
        return jsonWithRequestId(
            {
                status: "ok",
                timestamp: new Date().toISOString(),
            },
            {
                status: 200,
                headers: {
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                },
            }
        );
    });
}
