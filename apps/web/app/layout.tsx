import type { Metadata } from "next";
import type { ReactNode } from "react";
import { siteOrigin } from "../src/catalog";
import { Navigation } from "../src/navigation";
import { SiteFooter } from "../src/site-footer";
import "./styles.css";
import "./experience.css";
import "./public-design.css";

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
        <SiteFooter />
      </body>
    </html>
  );
}
