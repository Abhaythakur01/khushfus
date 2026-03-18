"use client";

import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, icon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const errorId = error && inputId ? `${inputId}-error` : undefined;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={errorId}
            className={cn(
              "w-full h-10 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 text-sm text-slate-200",
              "placeholder:text-slate-500",
              "input-focus transition-all duration-200",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              "hover:border-white/[0.12] hover:bg-white/[0.06]",
              icon && "pl-10",
              error && "border-red-500/50 focus:ring-red-500/20 focus:border-red-500/50",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    );
  },
);

Input.displayName = "Input";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
    const errorId = error && inputId ? `${inputId}-error` : undefined;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-300"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={cn(
            "w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-slate-200",
            "placeholder:text-slate-500",
            "input-focus transition-all duration-200",
            "disabled:opacity-40 disabled:cursor-not-allowed",
            "hover:border-white/[0.12] hover:bg-white/[0.06]",
            "min-h-[80px] resize-y",
            error && "border-red-500/50 focus:ring-red-500/20 focus:border-red-500/50",
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-400 mt-1">{error}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export { Input, Textarea };
export type { InputProps, TextareaProps };
