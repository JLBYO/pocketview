import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pocketview — Your money, made clear",
  description: "A private, clear budget dashboard for your ANZ transactions.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-AU"><body>{children}</body></html>;
}
