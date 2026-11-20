export function whatsappLink(message: string) {
  const number = process.env.MARKETPLACE_WHATSAPP_NUMBER?.trim().replace(
    /^\+/,
    "",
  );
  if (!number || !/^[1-9]\d{7,14}$/.test(number)) return undefined;
  return "https://wa.me/" + number + "?text=" + encodeURIComponent(message);
}

export function contactEmail() {
  const email = process.env.MARKETPLACE_CONTACT_EMAIL?.trim();
  return email && /^[^\s@?:#]+@[^\s@?:#]+\.[^\s@?:#]+$/.test(email)
    ? email
    : undefined;
}
