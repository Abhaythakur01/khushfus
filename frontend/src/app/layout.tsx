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
  title: {
    default: "KhushFus — Social Listening Platform",
    template: "%s | KhushFus",
  },
  description:
    "Enterprise social listening and analytics platform. Monitor mentions, track sentiment, and manage your brand reputation across all channels.",
  keywords: ["social listening", "brand monitoring", "sentiment analysis", "analytics", "social media monitoring", "competitive intelligence"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://app.khushfus.com"),
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "KhushFus",
    title: "KhushFus — Enterprise Social Listening Platform",
    description: "Monitor mentions, track sentiment, and manage your brand reputation across all channels.",
  },
  twitter: {
    card: "summary_large_image",
    title: "KhushFus — Enterprise Social Listening Platform",
    description: "Monitor mentions, track sentiment, and manage your brand reputation across all channels.",
  },
  robots: {
    index: false,
    follow: false,
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[200] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          Skip to main content
        </a>
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
                background: "#141925",
                color: "#e2e8f0",
                borderRadius: "0.75rem",
                fontSize: "0.875rem",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              },
              success: {
                iconTheme: { primary: "#10b981", secondary: "#e2e8f0" },
              },
              error: {
                iconTheme: { primary: "#ef4444", secondary: "#e2e8f0" },
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
