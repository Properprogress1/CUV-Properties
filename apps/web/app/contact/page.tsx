import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { contactEmail, contactPhone, whatsappLink } from "../../src/contact";
import { ContactActions } from "../../src/contact-actions";
import { contentPage } from "../../src/editorial";

export const metadata: Metadata = {
  title: "Contact CUV Global",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const entry = await contentPage("contact").catch(() => null);
  const content = entry?.kind === "CONTACT" ? entry.content : undefined;
  const hasContact = contactPhone() || contactEmail() || whatsappLink("");

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
          <ContactActions />
          {content?.linkHref && (
            <Link className="text-link" href={content.linkHref}>
              {content.linkLabel}
            </Link>
          )}
          {!content && !hasContact && (
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
