import { Lilita_One } from "next/font/google";

// The arcade games use Cucaino Park's display face (FONT.display reads --font-park-display).
// Inside the park it comes from app/park/[kidId]/layout.tsx; this gives the flat
// /play/arcade/[game] pages the same font.
const parkDisplay = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-park-display",
  display: "swap",
});

export default function ArcadeGameLayout({ children }: { children: React.ReactNode }) {
  return <div className={parkDisplay.variable}>{children}</div>;
}
