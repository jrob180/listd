import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Listd - Sell anything with a text",
  description:
    "We make selling easier than buying. Listd lets you sell with a text.",
  openGraph: {
    title: "Listd - Sell anything with a text",
    description: "We make selling easier than buying.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--fg)] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
