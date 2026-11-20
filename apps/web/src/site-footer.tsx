import Link from "next/link";
import { ArrowUpRight, Mail, MessageCircle, Phone } from "lucide-react";
import { Brand } from "./navigation";
import { contentList } from "./editorial";
import { catalog } from "./catalog";
import { contactEmail, contactPhone, whatsappLink } from "./contact";

export async function SiteFooter() {
  const [editorial, services] = await Promise.all([
    contentList().catch(() => []),
    catalog(new URLSearchParams({ category: "SERVICE", pageSize: "4" })).catch(
      () => null,
    ),
  ]);
  const legal = editorial.filter(({ kind }) => kind === "LEGAL");
  const serviceListings = services?.items.filter(({ isDemo }) => !isDemo) ?? [];
  const phone = contactPhone();
  const email = contactEmail();
  const whatsapp = whatsappLink(
    "Hello CUV Global, I have a marketplace enquiry.",
  );

  return (
    <footer className="lux-footer">
      <div className="wrap">
        <div className="lux-footer-intro">
          <div>
            <Brand />
            <p>
              Explore properties, land and professional services across Nigeria.
            </p>
          </div>
          <div>
            <h2>Let’s talk about your next move.</h2>
            <Link className="button lux-gold-button" href="/contact">
              Contact CUV Global <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </div>
        <div className="lux-footer-directory">
          <nav aria-label="Company">
            <h2>Company</h2>
            <Link href="/">Home</Link>
            <Link href="/about">About us</Link>
            <Link href="/contact">Contact</Link>
            <Link href="/account">Your account</Link>
          </nav>
          <nav aria-label="Properties and listings">
            <h2>Explore</h2>
            <Link href="/browse/properties">All properties</Link>
            <Link href="/browse/properties?propertyType=RESIDENTIAL">
              Residential
            </Link>
            <Link href="/browse/properties?propertyType=COMMERCIAL">
              Commercial
            </Link>
            <Link href="/browse/land">Land</Link>
            <Link href="/browse/vehicles">Vehicles</Link>
          </nav>
          <nav aria-label="Professional services">
            <h2>Professional services</h2>
            <Link href="/browse/services">Explore services</Link>
            {serviceListings.map(({ slug, title }) => (
              <Link key={slug} href={"/listings/" + slug}>
                {title}
              </Link>
            ))}
          </nav>
          <div>
            <h2>Get in touch</h2>
            {phone && (
              <a href={"tel:" + phone}>
                <Phone size={16} aria-hidden="true" /> {phone}
              </a>
            )}
            {email && (
              <a
                href={"mailto:" + encodeURIComponent(email).replace("%40", "@")}
              >
                <Mail size={16} aria-hidden="true" /> {email}
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noreferrer">
                <MessageCircle size={16} aria-hidden="true" /> WhatsApp
              </a>
            )}
            <Link href="/contact">Contact options</Link>
          </div>
        </div>
        <div className="lux-footer-bottom">
          <p>© {new Date().getUTCFullYear()} CUV Properties</p>
          <nav aria-label="Marketplace policies">
            {legal.map(({ slug, content }) => (
              <Link key={slug} href={"/pages/" + slug}>
                {content.title}
              </Link>
            ))}
            <Link href="/pages">Marketplace information</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
