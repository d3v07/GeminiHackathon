import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ToastProvider } from '@/components/ToastContainer';
import localFont from "next/font/local";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Project Metropolis — AI Agent Simulation",
  description: "Multi-agent autonomous platform for NYC simulation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-emerald-500/30 font-sans`}>
          <ToastProvider>
            {children}
          </ToastProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
