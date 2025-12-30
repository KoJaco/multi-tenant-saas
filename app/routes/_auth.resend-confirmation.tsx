import {
    Form,
    Link,
    useActionData,
    useLoaderData,
    useSearchParams,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "react-router";
import { Button } from "~/components/ui/button";

export async function action({ request }: ActionFunctionArgs) {
    const { checkRateLimit, createRateLimitError, rateLimitPresets } =
        await import("~/lib/rate-limit.server");
    const { createAuthSupabaseClient } =
        await import("~/lib/auth/utils.server");
    const { createErrorResponse, mapAuthError } =
        await import("~/lib/auth/errors.server");
    const { requireCsrfToken } = await import("~/lib/csrf.server");
    const { safeValidateFormData, resendConfirmationSchema } =
        await import("~/lib/auth/validation.server");

    // Check rate limit
    const rateLimitResult = await checkRateLimit(
        request,
        rateLimitPresets.resendConfirmation
    );
    if (!rateLimitResult.allowed) {
        const { error, status, headers } =
            createRateLimitError(rateLimitResult);
        return createErrorResponse(error, status, headers);
    }

    // Validate CSRF token
    try {
        await requireCsrfToken(request);
    } catch (error) {
        if (error instanceof Response) {
            return createErrorResponse(
                "Invalid CSRF token",
                403,
                new Headers()
            );
        }
        throw error;
    }

    const formData = await request.formData();
    const { supabase, headers } = await createAuthSupabaseClient(request);

    // Validate input
    const validation = safeValidateFormData(resendConfirmationSchema, formData);
    if (!validation.success) {
        return createErrorResponse(validation.error, 400, headers);
    }

    const { email } = validation.data;

    const { error } = await supabase.auth.resend({
        type: "signup",
        email,
    });

    if (error) {
        return createErrorResponse(mapAuthError(error), 400, headers);
    }

    return {
        error: "",
        status: 200,
        headers,
    };
}

export async function loader({ request }: LoaderFunctionArgs) {
    const { getCsrfTokenWithHeaders } = await import("~/lib/csrf.server");

    const { token, headers } = await getCsrfTokenWithHeaders(request);

    return { csrfToken: token, headers };
}

export default function ResendConfirmation() {
    const actionData = useActionData<typeof action>();
    const loaderData = useLoaderData<typeof loader>();
    const [searchParams] = useSearchParams();
    const emailFromQuery = searchParams.get("email") || "";

    return (
        <div className="flex min-h-screen flex-col">
            <main className="flex flex-1 items-center justify-center">
                <div className="p-8 flex flex-col gap-y-8 w-full sm:min-w-[400px] sm:max-w-[440px]">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold">
                            Resend Confirmation Email
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Enter your email address to receive a new
                            confirmation link
                        </p>
                    </div>

                    <Form method="post" className="space-y-4">
                        <input
                            type="hidden"
                            name="csrf_token"
                            value={loaderData.csrfToken}
                        />
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-sm font-medium"
                            >
                                Email address
                            </label>
                            <input
                                id="email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                required
                                defaultValue={emailFromQuery}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>

                        {actionData?.error && (
                            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                                {actionData.error}
                            </div>
                        )}

                        {actionData?.status === 200 && (
                            <div className="space-y-4">
                                <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-750 dark:text-emerald-200 text-center">
                                    Confirmation email has been sent. Please
                                    check your inbox.
                                </div>
                                <div>
                                    <Link
                                        to="/login"
                                        className="text-sm text-primary hover:underline font-medium"
                                    >
                                        ← Back to login
                                    </Link>
                                </div>
                            </div>
                        )}

                        <Button type="submit" className="w-full">
                            Resend Confirmation Email
                        </Button>
                    </Form>
                </div>
            </main>
        </div>
    );
}
