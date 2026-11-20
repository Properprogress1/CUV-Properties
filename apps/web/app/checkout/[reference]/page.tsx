import type { Metadata } from "next";
import { SandboxPayment } from "../../../src/commerce";

export const metadata: Metadata = {
  title: "Sandbox payment",
  robots: { index: false, follow: false },
};

export default async function Page({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  return <SandboxPayment key={reference} reference={reference} />;
}
