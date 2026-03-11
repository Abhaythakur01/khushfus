"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { User, Mail, Lock } from "lucide-react";
import toast from "react-hot-toast";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const HAS_UPPERCASE = /[A-Z]/;
  const HAS_NUMBER = /[0-9]/;

  const validateFields = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (!fullName.trim()) {
      errors.fullName = "Full name is required.";
    }
    if (!email) {
      errors.email = "Email is required.";
    } else if (!EMAIL_RE.test(email)) {
      errors.email = "Please enter a valid email address.";
    }
    if (!password) {
      errors.password = "Password is required.";
    } else if (password.length < 8) {
      errors.password = "Password must be at least 8 characters.";
    } else if (!HAS_UPPERCASE.test(password)) {
      errors.password = "Password must contain at least one uppercase letter.";
    } else if (!HAS_NUMBER.test(password)) {
      errors.password = "Password must contain at least one number.";
    }
    if (!confirmPassword) {
      errors.confirmPassword = "Please confirm your password.";
    } else if (password !== confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
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
      await register(email, password, fullName);
      toast.success("Account created successfully!");
      router.push("/dashboard");
    } catch (err: unknown) {
      const apiErr = err as { status?: number };
      const message =
        apiErr?.status === 409
          ? "An account with this email already exists."
          : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-slate-900 mb-1">
        Create your account
      </h2>
      <p className="text-sm text-slate-500 mb-8">
        Start monitoring your brand in minutes
      </p>

      {error && (
        <div className="mb-6 p-3 rounded-lg bg-danger-50 border border-danger-200 text-sm text-danger-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Full name"
          type="text"
          placeholder="Jane Smith"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setFieldErrors((f) => ({ ...f, fullName: undefined })); }}
          icon={<User className="h-4 w-4" />}
          autoComplete="name"
          error={fieldErrors.fullName}
          required
        />

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
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setFieldErrors((f) => ({ ...f, password: undefined })); }}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          error={fieldErrors.password}
          required
        />

        <Input
          label="Confirm password"
          type="password"
          placeholder="Re-enter your password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((f) => ({ ...f, confirmPassword: undefined })); }}
          icon={<Lock className="h-4 w-4" />}
          autoComplete="new-password"
          error={fieldErrors.confirmPassword}
          required
        />

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-primary-600 hover:text-primary-700"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
