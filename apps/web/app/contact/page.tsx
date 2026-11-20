import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail, MessageCircle } from "lucide-react";
import { contactEmail, whatsappLink } from "../../src/contact";
import { contentPage } from "../../src/editorial";

export const metadata: Metadata = {
  title: "Contact CUV Global",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const entry = await contentPage("contact").catch(() => null);
  const content = entry?.kind === "CONTACT" ? entry.content : undefined;
  const email = contactEmail();
  const whatsapp = whatsappLink(
    "Hello CUV Global, I have a marketplace enquiry.",
  );

  return (
    <div className="wrap cuv-document cuv-contact-page">
      <header className="cuv-document-head">
        <h1>Contact CUV Global</h1>
        <p>
          {content?.summary ||
            "Get help with a listing or speak with the marketplace team."}
        </p>
      </header>
      <div className="cuv-contact-grid">
        <section className="account-panel">
          <h2>{content?.title || "General enquiries"}</h2>
          {content?.body && <p className="description">{content.body}</p>}
          <div className="filter-actions">
            {whatsapp && (
              <a
                className="button button-dark"
                href={whatsapp}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={18} aria-hidden="true" /> Chat on WhatsApp
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            )}
            {email && (
              <a className="button button-light" href={"mailto:" + email}>
                <Mail size={18} aria-hidden="true" /> Email CUV Global
              </a>
            )}
            {content?.linkHref && (
              <Link className="text-link" href={content.linkHref}>
                {content.linkLabel}
              </Link>
            )}
          </div>
          {!content && !email && !whatsapp && (
            <p>General contact details haven’t been published yet.</p>
          )}
        </section>
        <section className="account-panel">
          <h2>Ask about a listing</h2>
          <p>
            Open an active listing to send an enquiry or request a viewing or
            consultation.
          </p>
          <Link className="text-link" href="/browse">
            Browse listings <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </section>
      </div>
    </div>
  );
}
