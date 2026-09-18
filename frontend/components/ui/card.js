import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
    return <div className={cn("rounded-2xl border border-[#26312b] bg-[#131917]", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
    return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
    return (
        <h3
            className={cn(
                "font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight text-[#f3f6f4]",
                className
            )}
            {...props}
        />
    );
}

export function CardDescription({ className, ...props }) {
    return <p className={cn("text-sm text-[#aebbb5]", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
    return <div className={cn("p-6 pt-2", className)} {...props} />;
}
