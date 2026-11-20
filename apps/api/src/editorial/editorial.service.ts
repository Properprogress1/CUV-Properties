import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ContentKind, Prisma } from "@prisma/client";
import { categories } from "@marketplace/inventory";
import { z } from "zod";
import { publicListingWhere } from "../catalog/catalog.module";
import { jsonMoney } from "../commerce/commerce.service";
import { PrismaService } from "../prisma/prisma.module";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
export const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(100);
const href = text(1, 300).refine(
  (value) =>
    value.startsWith("/") &&
    !value.startsWith("//") &&
    [...value].every((char) => char !== "\\" && char.charCodeAt(0) > 32),
  "Use a site-relative path",
);
export const content = z
  .object({
    title: text(1, 160),
    body: text(1, 24000),
    summary: text(0, 300),
    linkLabel: text(0, 70),
    linkHref: z.union([z.literal(""), href]),
    seoTitle: text(0, 70),
    seoDescription: text(0, 160),
  })
  .strict()
  .refine(
    (input) => Boolean(input.linkHref) === Boolean(input.linkLabel),
    "Provide both a link label and path",
  );
export const newEntry = z
  .object({ slug, kind: z.nativeEnum(ContentKind), draft: content })
  .strict();
const version = z.number().int().min(0).max(2147483646);
export const changeEntry = z.object({ version, draft: content }).strict();
export const publication = z
  .object({ version, action: z.enum(["publish", "unpublish"]) })
  .strict();
export const editorialFilters = z
  .object({
    kind: z.nativeEnum(ContentKind).optional(),
    page: z.coerce.number().int().min(1).max(1000).default(1),
  })
  .strict();
export const metricInput = z.discriminatedUnion("event", [
  z.object({ event: z.enum(["VIEW", "CONTACT"]), slug }).strict(),
  z
    .object({
      event: z.enum(["SEARCH", "ZERO_RESULTS"]),
      category: z.enum(categories).optional(),
    })
    .strict(),
]);

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(value);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "Enter a calendar date");
export const range = z
  .object({ from: day.optional(), to: day.optional() })
  .strict();
export const inventoryFilters = z
  .object({
    category: z.enum(categories).optional(),
    status: z
      .enum([
        "DRAFT",
        "PUBLISHED",
        "UNPUBLISHED",
        "RESERVED",
        "SOLD",
        "RENTED",
        "COMPLETED",
        "ARCHIVED",
        "EXPIRED",
      ])
      .optional(),
  })
  .strict();

const format = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
function calendarDay(date: Date) {
  const parts = format.formatToParts(date);
  return ["year", "month", "day"]
    .map((name) => parts.find((part) => part.type === name)?.value)
    .join("-");
}

function interval(input: z.infer<typeof range>) {
  const now = new Date();
  const from =
    input.from ?? calendarDay(new Date(now.getTime() - 29 * 86400000));
  const to = input.to ?? calendarDay(now);
  const start = new Date(from + "T00:00:00+01:00");
  const end = new Date(new Date(to + "T00:00:00+01:00").getTime() + 86400000);
  if (end <= start || end.getTime() - start.getTime() > 92 * 86400000)
    throw new BadRequestException("Choose a date range of at most 92 days");
  return {
    from,
    to,
    window: { gte: start, lt: end },
    dayWindow: { gte: new Date(from), lte: new Date(to) },
  };
}

function cell(value: unknown) {
  const text = String(value ?? "");
  const first = [...text.trimStart()].find((char) => char.charCodeAt(0) > 32);
  const safe = first && "=+-@".includes(first) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function csv(rows: unknown[][]) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
function counted<T extends { _count?: true | { _all?: number } | undefined }>(
  rows: T[],
) {
  return rows.map(({ _count, ...group }) => ({
    ...group,
    _count: { _all: typeof _count === "object" ? (_count._all ?? 0) : 0 },
  }));
}
const fields = {
  slug: true,
  kind: true,
  published: true,
  publishedAt: true,
} as const;

@Injectable()
export class EditorialService {
  constructor(private readonly prisma: PrismaService) {}

  list(input: z.infer<typeof editorialFilters>) {
    return this.prisma.contentEntry.findMany({
      where: input.kind ? { kind: input.kind } : {},
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * 25,
      take: 25,
    });
  }

  async publicContent() {
    const rows = await this.prisma.contentEntry.findMany({
      where: { publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { slug: "asc" }],
      take: 100,
      select: fields,
    });
    return rows.map(({ published, ...entry }) => ({
      ...entry,
      content: published,
    }));
  }

  async page(slug: string) {
    const row = await this.prisma.contentEntry.findFirst({
      where: { slug, publishedAt: { not: null } },
      select: fields,
    });
    if (!row) throw new NotFoundException("Content not found");
    const { published, ...entry } = row;
    return { ...entry, content: published };
  }

  async create(actorId: string, input: z.infer<typeof newEntry>) {
    const fixed = { HOME: "home", ABOUT: "about", CONTACT: "contact" } as const;
    const required = fixed[input.kind as keyof typeof fixed];
    if (
      required
        ? input.slug !== required
        : Object.values(fixed).some((item) => item === input.slug)
    )
      throw new BadRequestException("This content kind uses a reserved slug");
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.contentEntry.create({ data: input });
        await tx.editorialAudit.create({
          data: { actorId, subject: row.slug, action: "CONTENT_CREATED" },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("This content slug is already in use");
      throw error;
    }
  }

  mutate(
    actorId: string,
    slug: string,
    input: z.infer<typeof changeEntry> | z.infer<typeof publication>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.contentEntry.findUnique({ where: { slug } });
      if (!row) throw new NotFoundException("Content not found");
      if (row.version !== input.version)
        throw new ConflictException("Content changed. Reload and try again.");
      const draft = "draft" in input;
      const data = draft
        ? { draft: input.draft }
        : input.action === "publish"
          ? {
              published: row.draft as Prisma.InputJsonValue,
              publishedAt: new Date(),
            }
          : { published: Prisma.DbNull, publishedAt: null };
      const result = await tx.contentEntry.updateMany({
        where: { id: row.id, version: input.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (!result.count)
        throw new ConflictException("Content changed. Reload and try again.");
      await tx.editorialAudit.create({
        data: {
          actorId,
          subject: slug,
          action: draft
            ? "CONTENT_EDITED"
            : "CONTENT_" + input.action.toUpperCase(),
        },
      });
      return tx.contentEntry.findUniqueOrThrow({ where: { id: row.id } });
    });
  }

  async metric(input: z.infer<typeof metricInput>) {
    let category = "ALL";
    if ("slug" in input) {
      const listing = await this.prisma.listing.findFirst({
        where: {
          slug: input.slug,
          isDemo: false,
          AND: [publicListingWhere(new Date())],
        },
        select: { category: true },
      });
      if (!listing) return;
      category = listing.category;
    } else category = input.category ?? "ALL";
    const date = calendarDay(new Date());
    const key = [date, input.event, category].join(":");
    await this.prisma.$executeRaw`
      INSERT INTO "CatalogMetric" ("key", "day", "event", "category", "count")
      VALUES (${key}, ${date}::date, ${input.event}, ${category}, 1)
      ON CONFLICT ("key") DO UPDATE SET "count" = "CatalogMetric"."count" + 1`;
  }

  async report(input: z.infer<typeof range>) {
    const { from, to, window, dayWindow } = interval(input);
    const [
      inventory,
      enquiries,
      bookings,
      orders,
      services,
      payments,
      refunds,
      traffic,
    ] = await this.prisma.$transaction(
      [
        this.prisma.listing.groupBy({
          by: ["category", "status"],
          orderBy: [{ category: "asc" }, { status: "asc" }],
          where: { isDemo: false },
          _count: { _all: true },
        }),
        this.prisma.enquiry.groupBy({
          by: ["status"],
          orderBy: { status: "asc" },
          where: { createdAt: window },
          _count: { _all: true },
        }),
        this.prisma.appointment.groupBy({
          by: ["status"],
          orderBy: { status: "asc" },
          where: { createdAt: window },
          _count: { _all: true },
        }),
        this.prisma.order.groupBy({
          by: ["status"],
          orderBy: { status: "asc" },
          where: { createdAt: window },
          _count: { _all: true },
        }),
        this.prisma.serviceRequest.groupBy({
          by: ["status"],
          orderBy: { status: "asc" },
          where: { createdAt: window },
          _count: { _all: true },
        }),
        this.prisma.payment.groupBy({
          by: ["currency", "provider"],
          orderBy: [{ currency: "asc" }, { provider: "asc" }],
          where: { status: "SUCCEEDED", confirmedAt: window },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        this.prisma.refund.groupBy({
          by: ["currency"],
          orderBy: { currency: "asc" },
          where: { status: "SUCCEEDED", updatedAt: window },
          _sum: { amountMinor: true },
          _count: { _all: true },
        }),
        this.prisma.catalogMetric.groupBy({
          by: ["event", "category"],
          orderBy: [{ event: "asc" }, { category: "asc" }],
          where: { day: dayWindow },
          _sum: { count: true },
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    return jsonMoney({
      from,
      to,
      inventory: counted(inventory),
      enquiries: counted(enquiries),
      bookings: counted(bookings),
      orders: counted(orders),
      services: counted(services),
      payments: counted(payments).map((row) => ({
        ...row,
        _sum: { amountMinor: row._sum?.amountMinor ?? 0n },
      })),
      refunds: counted(refunds).map((row) => ({
        ...row,
        _sum: { amountMinor: row._sum?.amountMinor ?? 0n },
      })),
      traffic: traffic.map((row) => ({
        ...row,
        _sum: { count: row._sum?.count ?? 0 },
      })),
    });
  }

  async exportReport(actorId: string, input: z.infer<typeof range>) {
    const report = await this.report(input);
    const rows: unknown[][] = [
      [
        "section",
        "category",
        "state",
        "count",
        "currency",
        "amount_minor",
        "from_lagos",
        "to_lagos",
      ],
    ];
    const add = (
      section: string,
      category: string,
      status: string,
      count: number,
      currency = "",
      amount: unknown = "",
    ) =>
      rows.push([
        section,
        category,
        status,
        count,
        currency,
        amount,
        report.from,
        report.to,
      ]);
    for (const row of report.inventory)
      add("inventory", row.category, row.status, row._count._all);
    for (const section of [
      "enquiries",
      "bookings",
      "orders",
      "services",
    ] as const)
      for (const row of report[section])
        add(section, "", row.status, row._count._all);
    for (const row of report.traffic)
      add("traffic", row.category, row.event, row._sum.count ?? 0);
    for (const row of report.payments)
      add(
        "payments",
        row.provider,
        "SUCCEEDED",
        row._count._all,
        row.currency,
        row._sum.amountMinor,
      );
    for (const row of report.refunds)
      add(
        "refunds",
        "",
        "SUCCEEDED",
        row._count._all,
        row.currency,
        row._sum.amountMinor,
      );
    await this.prisma.editorialAudit.create({
      data: {
        actorId,
        action: "REPORT_EXPORTED",
        subject: report.from + "/" + report.to,
      },
    });
    return csv(rows);
  }

  async exportInventory(
    actorId: string,
    input: z.infer<typeof inventoryFilters>,
  ) {
    const items = await this.prisma.listing.findMany({
      where: {
        isDemo: false,
        ...(input.category && { category: input.category }),
        ...(input.status && { status: input.status }),
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 10001,
      select: {
        reference: true,
        title: true,
        category: true,
        status: true,
        currency: true,
        priceMinor: true,
      },
    });
    if (items.length > 10000)
      throw new BadRequestException(
        "Filter inventory before exporting more than 10,000 rows",
      );
    await this.prisma.editorialAudit.create({
      data: {
        actorId,
        action: "INVENTORY_EXPORTED",
        subject:
          [input.category, input.status].filter(Boolean).join("/") || "all",
      },
    });
    return csv([
      ["reference", "title", "category", "status", "currency", "price_minor"],
      ...items.map((row) => [
        row.reference,
        row.title,
        row.category,
        row.status,
        row.currency,
        row.priceMinor,
      ]),
    ]);
  }
}
