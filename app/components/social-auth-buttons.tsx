import { SocialAuthButton } from "./social-auth-button";

interface SocialAuthButtonsProps {
    redirectTo?: string;
}

export function SocialAuthButtons({
    redirectTo = "/dashboard",
}: SocialAuthButtonsProps) {
    return (
        <div className="space-y-3">
            <SocialAuthButton provider="google" redirectTo={redirectTo} />
            {/* Uncomment when GitHub auth is ready
      <SocialAuthButton provider="github" redirectTo={redirectTo} />
      */}
        </div>
    );
}
