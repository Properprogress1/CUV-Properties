import { notFound } from "next/navigation";
import { Browse } from "../../../src/browse";
import { resolveCategory, SearchParams, verticals } from "../../../src/catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category: slug } = await params;
  const category = resolveCategory(slug);
  if (!category) notFound();
  return {
    title: verticals[category].name,
    description: verticals[category].subtitle,
    alternates: { canonical: "/browse/" + slug },
  };
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const category = resolveCategory((await params).category);
  if (!category) notFound();
  return <Browse raw={await searchParams} category={category} />;
}
