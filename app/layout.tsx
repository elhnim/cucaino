import type { Metadata, Viewport } from "next";
import { Inter, Nunito } from "next/font/google";
import "./globals.css";
import PerfReporter from "@/components/PerfReporter";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Nunito is a Google variable font: omitting `weight` loads ONE variable woff2
// covering wght 200-1000. (The old explicit 5-weight list already deduped to
// this same file, so bytes are unchanged — but this collapses 25 @font-face
// declarations to 5 and makes font-medium/500, used on the login subtitle,
// render as a true weight instead of falling back to 400.)
const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cucaino",
  description: "Daily routine, chores, music practice, rewards & quizzes for kids",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cucaino",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#f97316",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${nunito.variable}`}>
      <body className="font-sans antialiased">
        <PerfReporter />
        {children}
      </body>
    </html>
  );
}
