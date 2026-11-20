import { actions, categories, statuses } from "@marketplace/inventory";
import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

const uuid = z.string().uuid();
export const version = z.number().int().nonnegative().max(2_147_483_646);
export const action = z.enum(actions);
export const filters = z
  .object({
    category: z.enum(categories).optional(),
    status: z.enum(statuses).optional(),
    locationId: uuid.optional(),
    featured: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    q: z.string().trim().max(150).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const location = z
  .object({
    country: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/)
      .transform((value) => value.toUpperCase()),
    region: z.string().trim().min(1).max(100),
    city: z.string().trim().min(1).max(100),
  })
  .strict();
export const listingAction = z.object({ action, version }).strict();
export const bulk = z
  .object({
    action: z.union([action, z.enum(["feature", "unfeature"])]),
    listings: z
      .array(z.object({ id: uuid, version }).strict())
      .min(1)
      .max(25)
      .refine(
        (items) => new Set(items.map(({ id }) => id)).size === items.length,
        "Listing IDs must be unique",
      ),
  })
  .strict();
export const gallery = z
  .object({
    version,
    items: z
      .array(
        z
          .object({
            id: uuid,
            alt: z.string().trim().max(300),
            cover: z.boolean(),
          })
          .strict(),
      )
      .max(24)
      .refine(
        (items) => new Set(items.map(({ id }) => id)).size === items.length,
        "Media IDs must be unique",
      )
      .refine(
        (items) => items.filter(({ cover }) => cover).length <= 1,
        "Choose one cover",
      ),
  })
  .strict();
export const upload = z
  .object({
    version: z
      .string()
      .regex(/^(0|[1-9]\d{0,9})$/)
      .transform(Number)
      .pipe(version),
    alt: z.string().trim().max(300),
  })
  .strict();

export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = Object.fromEntries(
      result.error.issues.map((issue) => [
        issue.path.join(".") || "input",
        issue.message,
      ]),
    );
    throw new BadRequestException({
      message: "Check the submitted values",
      fields,
    });
  }
  return result.data;
}
