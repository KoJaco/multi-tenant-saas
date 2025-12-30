// app/routes/api.billing.credit-checkout.tsx (action)
import { redirect } from "react-router";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { accounts } from "~/lib/db/schema";
import { serverConfig } from "~/lib/config.server";
import { createErrorResponse } from "~/lib/errors.server";
import { number } from "zod";

const stripe = new Stripe(serverConfig.STRIPE_SECRET_KEY || "", {
    apiVersion: "2025-08-27.basil",
});

export async function action({ request }: { request: Request }) {
    const { db } = await import("~/lib/db/index.server");
    const { requireUser } = await import("~/lib/auth/auth.server");

    const form = await request.formData();
    const priceId = form.get("priceId");
    const qtyString = form.get("quantity");

    if (!priceId || typeof priceId !== "string" || priceId.trim() === "") {
        return createErrorResponse(
            new Error("Invalid priceId format"),
            "Invalid priceId format, must be a non-empty string",
            400
        );
    }

    let qty = 1;

    // TODO: maybe add in env var to set stripe quantity max? E.g., a credit pack could have a very large quantity, but letting people purchase a massive quantity of a one-off product may be a security risk.

    if (qtyString) {
        const parsed = Number(qtyString);
        if (isNaN(parsed) || parsed < 1 || !Number.isInteger(parsed)) {
            return createErrorResponse(
                new Error("Invalid quantity format"),
                "Invalid quantity format, must be a positive integer",
                400
            );
        }
        qty = parsed;
    }

    // Look up account & stripeCustomerId from session
    const { appUser } = await requireUser(request);

    const account = await db.query.accounts.findFirst({
        where: eq(accounts.id, appUser.accountId),
    });

    if (!account) {
        return createErrorResponse(
            new Error("Account not found"),
            "Account not found",
            404
        );
    }

    const stripeCustomerId = account?.stripeCustomerId;
    const accountId = account?.id;

    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: stripeCustomerId ?? undefined, // or omit and set customer_creation on completion
        line_items: [{ price: priceId, quantity: qty }],
        allow_promotion_codes: true,
        success_url: `${serverConfig.APP_URL}/billing?status=success`,
        cancel_url: `${serverConfig.APP_URL}/billing?status=cancelled`,
        metadata: { accountId }, // useful in webhook
    });

    if (!session.url) {
        return createErrorResponse(
            new Error("Stripe checkout session URL not found"),
            "Stripe checkout session URL not found",
            500
        );
    }

    return redirect(session.url, 303);
}
