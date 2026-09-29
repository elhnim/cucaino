import { Lilita_One } from "next/font/google";

// Cucaino Park's display face (headings, numbers, buttons). Exposed as --font-park-display and
// read by components/park/ui/theme.ts; body text stays Nunito from the root layout.
const parkDisplay = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-park-display",
  display: "swap",
});

export default function ParkLayout({ children }: { children: React.ReactNode }) {
  return <div className={parkDisplay.variable}>{children}</div>;
}
