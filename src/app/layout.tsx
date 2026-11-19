import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NetworkStatus } from "@/components/NetworkStatus";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Travel Agent — Enterprise Operations Console",
    template: "%s | Travel Agent",
  },
  description: "Enterprise travel operations, cloud voice telephony, and AI concierge console.",
  applicationName: "Travel Agent",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <NetworkStatus />
      </body>
    </html>
  );
}
