"use client";

import React from "react";
import { Zap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#0a0f1a]">
      {/* Left panel -- brand */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700" />
        {/* Noise/texture overlay */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/10">
              <Zap className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight">KhushFus</span>
          </div>

          <div className="max-w-md">
            <h1 className="text-4xl font-bold leading-tight mb-4 tracking-tight">
              Social Listening,
              <br />
              Reimagined.
            </h1>
            <p className="text-lg text-white/70 leading-relaxed">
              Monitor brand mentions, track sentiment across channels, and turn
              social conversations into actionable insights -- all from one
              powerful platform.
            </p>
          </div>

          <p className="text-sm text-white/40">
            Trusted by 500+ brands worldwide
          </p>
        </div>

        {/* Decorative shapes */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-white/[0.04] rounded-full blur-2xl" />
        <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] bg-white/[0.04] rounded-full blur-2xl" />
        <div className="absolute top-1/2 right-12 w-64 h-64 bg-white/[0.03] rounded-full blur-xl" />
      </div>

      {/* Right panel -- form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-sm shadow-indigo-500/25">
              <Zap className="h-4 w-4" />
            </div>
            <span className="text-xl font-bold text-slate-100 tracking-tight">
              KhushFus
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  );
}
