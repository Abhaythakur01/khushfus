"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail, Lock } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateFields = (): boolean => {
    const errors: { email?: string; password?: string } = {};
    if (!email) {
      errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validateFields()) return;

    setLoading(true);
    try {
      await login(email, password, rememberMe);
      toast.success("Welcome back!");
      router.push("/dashboard");
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      const message =
        apiErr?.status === 401
          ? "Invalid email or password."
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
      <p className="text-sm text-slate-500 mb-8">
        Sign in to your account to continue
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-danger-50 border border-danger-200 text-sm text-danger-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email address"
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setFieldErrors((f) => ({ ...f, email: undefined })); }}
          icon={<Mail className="h-4 w-4" />}
          autoComplete="email"
          error={fieldErrors.email}
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldErrors((f) => ({ ...f, password: undefined })); }}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="current-password"
          error={fieldErrors.password}
          required
        />

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/20"
            />
            <span className="text-sm text-slate-600">Remember me</span>
          </label>
          <Link
            href="/login"
            className="text-sm font-medium text-primary-600 hover:text-primary-700"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        Don&apos;t have an account?{" "}
        <Link
          href="/register"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
