import { Mail, MessageCircle, Phone } from "lucide-react";
import { contactEmail, contactPhone, whatsappLink } from "./contact";

export function ContactActions({
  listing,
}: {
  listing?: { reference: string; url: string };
}) {
  const phone = contactPhone();
  const email = contactEmail();
  const message = listing
    ? `Hello CUV Global, I’m interested in ${listing.reference}. ${listing.url}`
    : "Hello CUV Global, I have a marketplace enquiry.";
  const whatsapp = whatsappLink(message);

  if (!phone && !email && !whatsapp) return null;

  const subject = encodeURIComponent(
    listing ? `Listing enquiry · ${listing.reference}` : "CUV Global enquiry",
  );
  const track = listing ? { "data-analytics-contact": true } : {};

  return (
    <div
      className="cuv-contact-actions"
      role="group"
      aria-label="Contact CUV Global"
    >
      {phone && (
        <a className="button button-light" href={"tel:" + phone} {...track}>
          <Phone size={18} aria-hidden="true" /> Call CUV Global
        </a>
      )}
      {whatsapp && (
        <a
          className="button button-light"
          href={whatsapp}
          target="_blank"
          rel="noreferrer"
          {...track}
        >
          <MessageCircle size={18} aria-hidden="true" /> Chat on WhatsApp
        </a>
      )}
      {email && (
        <a
          className="button button-light"
          href={`mailto:${encodeURIComponent(email).replace("%40", "@")}?subject=${subject}`}
          {...track}
        >
          <Mail size={18} aria-hidden="true" /> Email CUV Global
        </a>
      )}
    </div>
  );
}
