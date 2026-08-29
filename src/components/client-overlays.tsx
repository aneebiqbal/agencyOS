"use client";

import { usePathname } from "next/navigation";

import { ConfidentialityGate } from "@/components/confidentiality-gate";
import { WatermarkOverlay } from "@/components/watermark-overlay";

export function ClientOverlays() {
  const pathname = usePathname();
  const skipConfidentialityGate = pathname === "/" || pathname === "/login" || pathname === "/admin";

  return (
    <>
      {skipConfidentialityGate ? null : <ConfidentialityGate />}
      <WatermarkOverlay />
    </>
  );
}
