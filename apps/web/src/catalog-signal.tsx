"use client";

import { useEffect } from "react";

const origin = (
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001"
).replace(/\/$/, "");
type Input =
  | { event: "VIEW" | "CONTACT"; slug: string }
  | { event: "SEARCH" | "ZERO_RESULTS"; category?: string };
function track(value: Input) {
  if (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl
  )
    return;
  void fetch(origin + "/api/v1/analytics/events", {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  }).catch(() => undefined);
}

export function CatalogSignal({
  event,
  category,
  slug,
}: {
  event: "VIEW" | "SEARCH" | "ZERO_RESULTS";
  slug?: string;
  category?: string;
}) {
  useEffect(() => {
    if (event === "VIEW") {
      if (!slug) return;
      track({ event, slug });
      function contact(click: MouseEvent) {
        if (
          click.target instanceof Element &&
          click.target.closest("[data-analytics-contact]") &&
          slug
        )
          track({ event: "CONTACT", slug });
      }
      document.addEventListener("click", contact);
      return () => document.removeEventListener("click", contact);
    }
    track({ event, ...(category && { category }) });
  }, [event, slug, category]);
  return null;
}
