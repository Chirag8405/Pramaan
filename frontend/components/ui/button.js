import { cva } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
    "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] disabled:pointer-events-none disabled:opacity-50",
    {
        variants: {
            variant: {
                default: "bg-[#34d399] text-[#06231a] hover:bg-[#2bbf89]",
                secondary: "bg-[#131917] text-[#34d399] border border-[#35443c] hover:bg-[#1a211e]",
                ghost: "text-[#34d399] hover:bg-[#131917]",
                destructive: "bg-[#c23636] text-white hover:bg-[#a82c2c]"
            },
            size: {
                default: "h-10 px-4 py-2",
                lg: "h-11 px-6 py-2"
            }
        },
        defaultVariants: {
            variant: "default",
            size: "default"
        }
    }
);

export function Button({ className, variant, size, ...props }) {
    return <button suppressHydrationWarning className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
