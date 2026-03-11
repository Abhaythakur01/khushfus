"use client";

import React, { useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}

function Dialog({ open, onClose, onOpenChange, children, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const handleClose = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    },
    [handleClose],
  );

  // Focus trap: keep focus inside the dialog
  const handleTab = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement;
      const last = focusable[focusable.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [],
  );

  // Capture trigger element before dialog opens, manage focus
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement;
      document.addEventListener("keydown", handleEscape);
      document.addEventListener("keydown", handleTab);
      document.body.style.overflow = "hidden";

      // Focus first focusable element inside panel after render
      requestAnimationFrame(() => {
        if (panelRef.current) {
          const first = panelRef.current.querySelector(FOCUSABLE_SELECTOR) as HTMLElement | null;
          if (first) first.focus();
        }
      });
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape, handleTab]);

  // Return focus to trigger on close
  useEffect(() => {
    if (!open && triggerRef.current && triggerRef.current instanceof HTMLElement) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 w-full max-w-lg mx-4 bg-slate-900 rounded-xl shadow-xl animate-slide-up",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({
  className,
  children,
  onClose,
}: {
  className?: string;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-6 py-4 border-b border-slate-700",
        className,
      )}
    >
      <h2 className="text-lg font-semibold text-slate-100">{children}</h2>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close dialog"
          className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}

function DialogContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-6 py-4 text-slate-200", className)} {...props} />;
}

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-700 bg-slate-800/50 rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

export { Dialog, DialogHeader, DialogContent, DialogFooter };
