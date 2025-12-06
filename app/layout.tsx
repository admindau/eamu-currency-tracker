import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EAMU Currency Tracker",
  description:
    "Real-time FX dashboard for East African Monetary Union currencies, powered by Savvy Gorilla Technologies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white antialiased">
        {children}
      </body>
    </html>
  );
}
