import type { WheelSegment } from "@/lib/money-town/types"

interface Props { onResult: (segment: WheelSegment) => void }

export default function SpinWheel({ onResult }: Props) {
  return <div onClick={() => onResult('payday')}>SpinWheel stub</div>
}
