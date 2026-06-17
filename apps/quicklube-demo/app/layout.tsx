import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QuickLube Express — Fast oil changes & more",
  description:
    "QuickLube Express — walk-in oil changes, tire rotation, and brake service. Tell us how we did in 5 seconds.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
