import { cn } from "../../lib/utils";

export function Input({ className, type = "text", suppressHydrationWarning = true, ...props }) {
    return (
        <input
            type={type}
            suppressHydrationWarning={suppressHydrationWarning}
            className={cn(
                "flex h-11 w-full rounded-lg border border-[#35443c] bg-[#1a211e] px-3 py-2 text-sm text-[#f3f6f4] outline-none transition placeholder:text-[#8a9891] focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131917]",
                className
            )}
            {...props}
        />
    );
}
