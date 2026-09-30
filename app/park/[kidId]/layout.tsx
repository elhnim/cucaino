import { Lilita_One } from "next/font/google";

// Cucaino Park's display face (headings, numbers, buttons). Exposed as --font-park-display and
// read by components/park/ui/theme.ts; body text stays Nunito from the root layout.
const parkDisplay = Lilita_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-park-display",
  display: "swap",
});

// The park is a game screen: holding a button (fly up/down, the joystick) must never start iOS
// text selection or the long-press callout / magnifier. Typing fields stay selectable.
const NO_SELECT = `
.park-root, .park-root * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; -webkit-tap-highlight-color: transparent; }
.park-root input, .park-root textarea, .park-root [contenteditable="true"] { -webkit-user-select: text; user-select: text; -webkit-touch-callout: default; }
`;

export default function ParkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${parkDisplay.variable} park-root`}>
      <style>{NO_SELECT}</style>
      {children}
    </div>
  );
}
