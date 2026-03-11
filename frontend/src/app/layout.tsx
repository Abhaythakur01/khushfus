import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import { AuthProvider } from "@/lib/auth";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { WebVitalsReporter } from "@/components/WebVitalsReporter";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";
import { ThemeProvider } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "KhushFus — Social Listening Platform",
  description:
    "Enterprise social listening and analytics platform. Monitor mentions, track sentiment, and manage your brand reputation across all channels.",
  keywords: ["social listening", "brand monitoring", "sentiment analysis", "analytics"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <WebVitalsReporter />
        <ServiceWorkerRegistrar />
        <ErrorBoundary>
        <ThemeProvider>
        <AuthProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: "#1e293b",
                color: "#f8fafc",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              },
              success: {
                iconTheme: { primary: "#10b981", secondary: "#f8fafc" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#f8fafc" },
              },
            }}
          />
        </AuthProvider>
        </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
