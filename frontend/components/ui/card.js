import { cn } from "../../lib/utils";

export function Card({ className, ...props }) {
    return <div className={cn("rounded-2xl border border-[#d8e4df] bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
    return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
    return <h3 className={cn("text-lg font-bold text-[#20473d]", className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
    return <p className={cn("text-sm text-slate-600", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
    return <div className={cn("p-6 pt-2", className)} {...props} />;
}
