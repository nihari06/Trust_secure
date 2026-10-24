import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "TrustVault — Secure Document Management",
  description: "Enterprise-grade secure document sharing with tamper-evident audit trails and fine-grained access control.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="antialiased bg-[#F6F8FC] text-[#18243A]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
