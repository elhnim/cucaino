import CandyLoading from "@/components/park/ui/CandyLoading";

// Streams instantly while the park's data loads — same magical look as the in-app loader.
export default function ParkLoading() {
  return <CandyLoading label="Opening Cucaino Park…" />;
}
