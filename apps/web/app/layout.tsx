import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { siteOrigin } from "../src/catalog";
import { Brand, Navigation } from "../src/navigation";
import "./styles.css";
import "./experience.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: "CUV Marketplace", template: "%s | CUV Marketplace" },
  description:
    "Explore properties, land, vehicles and professional services across Nigeria.",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Navigation />
        <main id="main">{children}</main>
        <footer>
          <div className="wrap footer">
            <Brand />
            <Link href="/browse">Browse all listings</Link>
            <Link href="/pages">Marketplace information</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
