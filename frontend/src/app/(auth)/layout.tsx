"use client";

import React from "react";
import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel -- brand */}
      <div className="hidden lg:flex lg:w-1/2 gradient-brand relative overflow-hidden">
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight">KhushFus</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold leading-tight mb-4">
              Social Listening,
              <br />
              Reimagined.
            </h1>
            <p className="text-lg text-white/80 leading-relaxed">
              Monitor brand mentions, track sentiment across channels, and turn
              social conversations into actionable insights -- all from one
              powerful platform.
            </p>
          </div>

          <p className="text-sm text-white/50">
            Trusted by 500+ brands worldwide
          </p>
        </div>

        {/* Decorative shapes */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-white/5 rounded-full" />
        <div className="absolute top-1/2 right-12 w-64 h-64 bg-white/5 rounded-full" />
      </div>

      {/* Right panel -- form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-600 text-white">
              <Zap className="h-4.5 w-4.5" />
            </div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">
              KhushFus
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
