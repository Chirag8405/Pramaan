import { ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export function Select({ className, children, ...props }) {
    return (
        <div className="relative">
            <select
                className={cn(
                    "flex h-11 w-full appearance-none rounded-lg border border-[#35443c] bg-[#1a211e] px-3 py-2 pr-9 text-sm text-[#f3f6f4] outline-none transition focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131917]",
                    className
                )}
                {...props}
            >
                {children}
            </select>
            <ChevronDown
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8a9891]"
            />
        </div>
    );
}
