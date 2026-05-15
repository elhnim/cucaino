// components/onboarding/TourContext.tsx
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { TourStep } from "./tourSteps";

interface TourContextValue {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  currentStepData: TourStep | null;
  start: () => void;
  next: () => void;
  skip: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({
  steps,
  onComplete,
  children,
}: {
  steps: TourStep[];
  onComplete: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    setCurrentStep(0);
    setActive(true);
    router.push(steps[0].route);
  }, [steps, router]);

  const next = useCallback(() => {
    setCurrentStep((prev) => {
      if (prev < steps.length - 1) {
        const nextIdx = prev + 1;
        router.push(steps[nextIdx].route);
        return nextIdx;
      }
      setActive(false);
      onCompleteRef.current();
      return prev;
    });
  }, [steps, router]);

  const skip = useCallback(() => {
    setActive(false);
    onCompleteRef.current();
  }, []);

  return (
    <TourContext.Provider
      value={{
        active,
        currentStep,
        totalSteps: steps.length,
        currentStepData: active ? steps[currentStep] : null,
        start,
        next,
        skip,
      }}
    >
      {children}
    </TourContext.Provider>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}

/** Rendered inside TourProvider when the wrapper phase transitions to "touring".
 *  Calls start() on mount so the tour activates without the wrapper needing
 *  direct access to the context. */
export function TourAutoStart() {
  const { start } = useTour();
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      start();
    }
  }, [start]);
  return null;
}
