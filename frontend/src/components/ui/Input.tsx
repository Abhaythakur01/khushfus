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

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900",
              "placeholder:text-slate-400",
              "input-focus transition-colors duration-150",
              "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed",
              icon && "pl-10",
              error && "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500",
              className,
            )}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-danger-600 mt-1">{error}</p>
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

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900",
            "placeholder:text-slate-400",
            "input-focus transition-colors duration-150",
            "disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed",
            "min-h-[80px] resize-y",
            error && "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500",
            className,
          )}
          {...props}
        />
        {error && (
          <p className="text-xs text-danger-600 mt-1">{error}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export { Input, Textarea };
export type { InputProps, TextareaProps };
