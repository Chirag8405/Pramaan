import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
    {
        variants: {
            variant: {
                default: "border-[#1f4a38] bg-[#0f2e22] text-[#4ade80]",
                warm: "border-[#4a3416] bg-[#332408] text-[#fbbf24]",
                danger: "border-[#4a1f1f] bg-[#3a1414] text-[#f87171]",
                neutral: "border-[#35443c] bg-[#1a211e] text-[#aebbb5]"
            }
        },
        defaultVariants: {
            variant: "default"
        }
    }
);

export function Badge({ className, variant, ...props }) {
    return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
