import { Link } from "react-router";
import { AlertCircle } from "lucide-react";

interface ErrorAlertProps {
    title?: string;
    message: string;
    className?: string;
    actions?: Array<{
        label: string;
        to: string;
    }>;
}

export function ErrorAlert({
    title,
    message,
    className = "",
    actions = [],
}: ErrorAlertProps) {
    return (
        <div
            className={`rounded-md bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive ${className}`}
        >
            <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                    <AlertCircle className="w-4 h-4" />
                </div>
                <div className="flex-1">
                    {title && <p className="font-medium">{title}</p>}
                    <p className={title ? "mt-1" : ""}>{message}</p>
                    {actions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-destructive/20 space-y-2">
                            {actions.map((action, index) => (
                                <Link
                                    key={index}
                                    to={action.to}
                                    className="text-sm text-primary hover:underline font-medium block"
                                >
                                    {action.label} →
                                </Link>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
