import {
    type LoaderFunctionArgs,
    type ActionFunctionArgs,
    useLoaderData,
    Form,
    useNavigation,
} from "react-router";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { z } from "zod";
import { cn } from "~/lib/utils";

const profileSchema = z.object({
    fullName: z.string().min(1, "Full name is required").max(100).optional(),
    bio: z.string().max(500).optional(),
});

export async function loader({ request }: LoaderFunctionArgs) {
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createErrorResponse } = await import("~/lib/errors.server");
    const { db } = await import("~/lib/db/index.server");
    const { users, userProfiles } = await import("~/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);

            // Get user profile
            const profile = await db.query.userProfiles.findFirst({
                where: eq(userProfiles.userId, appUser.id),
            });

            return {
                user: appUser,
                profile: profile || null,
            };
        } catch (error) {
            return createErrorResponse(error, "Failed to load profile", 500);
        }
    });
}

export async function action({ request }: ActionFunctionArgs) {
    // server imports
    const { initRequestContext, withRequestContext } =
        await import("~/lib/request-context.server");
    const { requireUser } = await import("~/lib/auth/auth.server");
    const { createErrorResponse, createActionErrorResponse } =
        await import("~/lib/errors.server");
    const { db } = await import("~/lib/db/index.server");
    const { userProfiles } = await import("~/lib/db/schema");
    const { eq } = await import("drizzle-orm");

    // request context
    const context = initRequestContext(request);

    return withRequestContext(context, async () => {
        try {
            const { appUser } = await requireUser(request);
            const formData = await request.formData();
            const intent = formData.get("intent");

            if (intent === "update-profile") {
                const result = profileSchema.safeParse({
                    fullName: formData.get("fullName") || undefined,
                    bio: formData.get("bio") || undefined,
                });

                if (!result.success) {
                    const errorMessage =
                        result.error.errors
                            .map((e) => `${e.path.join(".")}: ${e.message}`)
                            .join(", ") || "Invalid profile data";
                    return createActionErrorResponse(errorMessage, 400);
                }

                const { fullName, bio } = result.data;

                // Check if profile exists
                const existingProfile = await db.query.userProfiles.findFirst({
                    where: eq(userProfiles.userId, appUser.id),
                });

                if (existingProfile) {
                    // Update existing profile
                    await db
                        .update(userProfiles)
                        .set({
                            fullName: fullName || null,
                            bio: bio || null,
                            updatedAt: new Date(),
                        })
                        .where(eq(userProfiles.userId, appUser.id));
                } else {
                    // Create new profile
                    await db.insert(userProfiles).values({
                        userId: appUser.id,
                        fullName: fullName || null,
                        bio: bio || null,
                    });
                }

                return { success: true };
            }

            return createActionErrorResponse("Invalid action", 400);
        } catch (error) {
            return createErrorResponse(error, "Failed to update profile", 500);
        }
    });
}

export default function ProfilePage() {
    const { user, profile } = useLoaderData<typeof loader>();
    const navigation = useNavigation();
    const isSubmitting = navigation.state === "submitting";

    return (
        <div className="w-full space-y-6 mt-12 md:mt-0">
            <div>
                <h3 className="text-2xl font-medium">Profile</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your personal profile information
                </p>
            </div>

            <Card>
                <CardContent className="space-y-6">
                    {/* Account Information Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Account Information
                            </h4>
                            <div className="flex gap-x-4 justify-between flex-wrap gap-y-4">
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <div>
                                        <Badge
                                            variant="secondary"
                                            className="text-sm"
                                        >
                                            {user.role}
                                        </Badge>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Provider</Label>
                                    <div className="text-sm text-muted-foreground">
                                        {user.provider}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Email Verified</Label>
                                    <div>
                                        <Badge
                                            variant={
                                                user.emailVerified
                                                    ? "secondary"
                                                    : "destructive"
                                            }
                                            className={cn(
                                                "text-sm",
                                                user.emailVerified
                                                    ? "bg-green-100 text-green-800"
                                                    : "bg-red-100 text-red-800"
                                            )}
                                        >
                                            {user.emailVerified
                                                ? "Verified"
                                                : "Unverified"}
                                        </Badge>
                                    </div>
                                </div>

                                {user.lastLoginAt && (
                                    <div className="space-y-2">
                                        <Label>Last Login</Label>
                                        <div className="text-sm text-muted-foreground">
                                            {new Date(
                                                user.lastLoginAt
                                            ).toLocaleString()}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label>Account Created</Label>
                                    <div className="text-sm text-muted-foreground">
                                        {new Date(
                                            user.createdAt
                                        ).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* <Separator /> */}
                    <div className="my-12 w-full" />

                    {/* Profile Information Section */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="text-md font-semibold mb-4">
                                Profile Information
                            </h4>
                            <Form method="post" className="space-y-4">
                                <input
                                    type="hidden"
                                    name="intent"
                                    value="update-profile"
                                />

                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        name="email"
                                        type="email"
                                        value={user.email}
                                        disabled
                                        className="bg-background"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Email cannot be changed
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Full Name</Label>
                                    <Input
                                        id="fullName"
                                        name="fullName"
                                        type="text"
                                        defaultValue={profile?.fullName || ""}
                                        placeholder="Enter your full name"
                                        maxLength={100}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="bio">Bio</Label>
                                    <Textarea
                                        id="bio"
                                        name="bio"
                                        defaultValue={profile?.bio || ""}
                                        placeholder="Tell us about yourself"
                                        maxLength={500}
                                        rows={4}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {profile?.bio?.length || 0}/500
                                        characters
                                    </p>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full"
                                >
                                    {isSubmitting
                                        ? "Saving..."
                                        : "Save Changes"}
                                </Button>
                            </Form>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
