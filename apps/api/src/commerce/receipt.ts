import type { Receipt } from "@prisma/client";

function pdfText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, "\\$&");
}

export function receiptPdf(receipt: Receipt) {
  const title = receipt.itemTitle.match(/.{1,64}(?:\s|$)|.{1,64}/gu) ?? [
    receipt.itemTitle,
  ];
  const lines = [
    "CUV Marketplace | Payment receipt",
    "SANDBOX - no funds were charged",
    "",
    "Receipt " + receipt.reference,
    "Order " + receipt.orderReference,
    "Issued " + receipt.issuedAt.toISOString(),
    "Item " + title.shift(),
    ...title,
    "Confirmed amount: " +
      receipt.currency +
      " " +
      receipt.amountMinor.toString() +
      " minor units",
    "",
    "This receipt does not establish ownership, transfer title,",
    "or certify completion of a service.",
  ];
  const page =
    "BT /F1 12 Tf 16 TL 48 780 Td\n" +
    lines
      .map((line, index) => `${index ? "T* " : ""}(${pdfText(line)}) Tj`)
      .join("\n") +
    "\nET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(page)} >>\nstream\n${page}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += [
    "xref",
    "0 6",
    "0000000000 65535 f ",
    ...offsets.map((offset) => String(offset).padStart(10, "0") + " 00000 n "),
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    String(xref),
    "%%EOF",
    "",
  ].join("\n");
  return Buffer.from(pdf);
}
