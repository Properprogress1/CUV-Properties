import { redirect } from "next/navigation";
import { browsePath, searchQuery } from "../../src/catalog";
import type { Metadata } from "next";
import { Browse } from "../../src/browse";
import type { SearchParams } from "../../src/catalog";

export const metadata: Metadata = {
  title: "Browse listings",
  alternates: { canonical: "/browse" },
};
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = searchQuery(raw);
  if (parsed.success && parsed.data.category) {
    const query = new URLSearchParams();
    for (const [name, value] of Object.entries(raw))
      if (name !== "category" && typeof value === "string" && value)
        query.set(name, value);
    redirect(
      browsePath(parsed.data.category) + (query.size ? "?" + query : ""),
    );
  }
  return <Browse raw={raw} />;
}
