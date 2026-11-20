import { ArrowUpRight } from "lucide-react";
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
        <footer className="cuv-footer">
          <div className="wrap cuv-footer-grid">
            <div className="cuv-footer-brand">
              <Brand />
              <p>
                Properties, land, vehicles and professional services across
                Nigeria.
              </p>
            </div>
            <nav aria-label="Explore marketplace">
              <h2>Explore</h2>
              <Link href="/browse/properties">Properties</Link>
              <Link href="/browse/land">Land</Link>
              <Link href="/browse/vehicles">Vehicles</Link>
              <Link href="/browse/services">Professional services</Link>
            </nav>
            <nav aria-label="Customer resources">
              <h2>Customer resources</h2>
              <Link href="/account">Your account</Link>
              <Link href="/pages">Marketplace information</Link>
              <Link className="cuv-footer-contact" href="/contact">
                Contact CUV Global <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
