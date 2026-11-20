import type { Metadata } from "next";
import { CustomerAccount } from "../../src/customer-account";

export const metadata: Metadata = {
  title: "Your account",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CustomerAccount />;
}
