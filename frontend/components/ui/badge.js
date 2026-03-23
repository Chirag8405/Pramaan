import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
    {
        variants: {
            variant: {
                default: "border-[#b9d3c8] bg-[#eaf6f1] text-[#1f5b4b]",
                warm: "border-[#e4c2a8] bg-[#fff3e9] text-[#9a4c2f]",
                neutral: "border-[#dce2e5] bg-[#f6f8f9] text-[#4a5a63]"
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
