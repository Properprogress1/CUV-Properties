import { Mail, Phone } from "lucide-react";

export function ClientContact({
  email,
  phone,
  reference,
}: {
  email: string;
  phone?: string | null;
  reference: string;
}) {
  const number = phone?.trim().replace(/[\s().-]/g, "");
  const dialable = number && /^\+?\d{7,15}$/.test(number);
  const recipient = encodeURIComponent(email).replace("%40", "@");
  const subject = encodeURIComponent(`CUV Properties · ${reference}`);

  return (
    <div className="client-contact" role="group" aria-label="Client contact">
      {dialable && (
        <a href={`tel:${number}`}>
          <Phone size={16} aria-hidden="true" /> Call client
        </a>
      )}
      <a href={`mailto:${recipient}?subject=${subject}`}>
        <Mail size={16} aria-hidden="true" /> Email client
      </a>
    </div>
  );
}
