import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
import "@radix-ui/themes/styles.css";
import "./globals.css";

const firaSans = Fira_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Keyforge - Software licensing you control",
    template: "%s | Keyforge",
  },
  description:
    "A self-hosted platform for license keys, product users, device activations, signed sessions, webhooks, and audit logs.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${firaSans.variable} ${firaCode.variable}`} data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
