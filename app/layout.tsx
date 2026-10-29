import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fantasy",
  description:
    "A read-only fantasy basketball dashboard with category matchups, player rankings and league news.",
  robots: { index: false, follow: false },
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
