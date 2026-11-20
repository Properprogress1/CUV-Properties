import { catalogQuery } from "@marketplace/inventory";
import { AppointmentStatus, EnquiryStatus } from "@prisma/client";
import { z } from "zod";

const short = z.string().trim().min(2).max(100);
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d ()-]{7,25}$/);
export const version = z.number().int().min(0).max(2_147_483_646);
const instant = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const zone = z
  .string()
  .trim()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return /^[A-Za-z][A-Za-z0-9_+/-]*$/.test(value);
    } catch {
      return false;
    }
  }, "Choose a valid IANA time zone");
const slug = z
  .string()
  .trim()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9-]+$/);

export const profile = z
  .object({
    displayName: short.nullable(),
    phone: phone.nullable(),
    emailUpdates: z.boolean(),
  })
  .strict();
export const saveSearch = z
  .object({ name: short, filters: catalogQuery })
  .strict();
export const enquiry = z
  .object({
    slug,
    name: short,
    email,
    phone: phone.optional(),
    channel: z.enum(["EMAIL", "PHONE", "WHATSAPP"]),
    message: z.string().trim().min(10).max(2500),
    consent: z.literal(true),
  })
  .strict()
  .refine((input) => input.channel === "EMAIL" || Boolean(input.phone), {
    path: ["phone"],
    message: "Enter a phone number for the selected contact channel",
  });
export const staffEnquiry = z
  .object({
    version,
    status: z.nativeEnum(EnquiryStatus),
    assigneeEmail: email.nullable(),
    followUpAt: instant.nullable(),
    privateNote: z.string().trim().max(2500),
  })
  .strict();
const window = z
  .object({ startsAt: instant, endsAt: instant, timeZone: zone })
  .strict();
export const askAppointment = z
  .object({ slug, window, notes: z.string().trim().max(1500) })
  .strict();
export const changeAppointment = z
  .object({
    version,
    status: z.enum([
      "CONFIRMED",
      "RESCHEDULED",
      "CANCELLED",
      "COMPLETED",
      "NO_SHOW",
    ]),
    assigneeEmail: email.nullable().optional(),
    window: window.optional(),
  })
  .strict();
export const enquiryFilters = z
  .object({
    status: z.nativeEnum(EnquiryStatus).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export const appointmentFilters = z
  .object({
    status: z.nativeEnum(AppointmentStatus).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export const tokenInput = z
  .object({ token: z.string().regex(/^[\w-]{43}$/) })
  .strict();
