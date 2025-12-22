"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-zinc-700 text-zinc-300",
    success: "bg-green-900/50 text-green-400 border-green-800",
    warning: "bg-yellow-900/50 text-yellow-400 border-yellow-800",
    error: "bg-red-900/50 text-red-400 border-red-800",
    info: "bg-blue-900/50 text-blue-400 border-blue-800",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
