import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AppointmentStatus, EnquiryStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.module";
import { publicListingWhere } from "../catalog/catalog.module";
import {
  appointmentFilters,
  askAppointment,
  changeAppointment,
  enquiry,
  enquiryFilters,
  profile,
  saveSearch,
  staffEnquiry,
} from "./input";
import { notify } from "./notifications";

const listingSummary = {
  slug: true,
  title: true,
  category: true,
  reference: true,
} as const;
const leadSummary = {
  id: true,
  reference: true,
  status: true,
  message: true,
  listing: { select: listingSummary },
  createdAt: true,
} as const;
const appointmentSummary = {
  id: true,
  reference: true,
  status: true,
  startsAt: true,
  endsAt: true,
  timeZone: true,
  notes: true,
  version: true,
  listing: { select: listingSummary },
  createdAt: true,
} as const;
const staffAppointmentSummary = {
  ...appointmentSummary,
  customer: { select: { email: true, displayName: true, phone: true } },
  assignee: { select: { email: true } },
  activity: { orderBy: { createdAt: "desc" as const }, take: 30 },
};
const staffLeadSummary = {
  listing: { select: listingSummary },
  assignee: { select: { email: true } },
  activity: { orderBy: { createdAt: "desc" as const }, take: 30 },
};
const profileFields = {
  email: true,
  displayName: true,
  phone: true,
  emailUpdates: true,
  emailVerifiedAt: true,
} as const;
const liveSlots: AppointmentStatus[] = ["CONFIRMED", "RESCHEDULED"];
const appointmentSteps: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  REQUESTED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  CONFIRMED: ["RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"],
  RESCHEDULED: ["RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"],
  CANCELLED: [],
  COMPLETED: [],
  NO_SHOW: [],
};
const leadSteps: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "NOT_INTERESTED", "LOST", "SPAM", "CLOSED"],
  CONTACTED: [
    "QUALIFIED",
    "INSPECTION_SCHEDULED",
    "NEGOTIATION",
    "NOT_INTERESTED",
    "LOST",
    "SPAM",
    "CLOSED",
  ],
  QUALIFIED: [
    "INSPECTION_SCHEDULED",
    "NEGOTIATION",
    "CONVERTED",
    "NOT_INTERESTED",
    "LOST",
    "CLOSED",
  ],
  INSPECTION_SCHEDULED: [
    "QUALIFIED",
    "NEGOTIATION",
    "CONVERTED",
    "NOT_INTERESTED",
    "LOST",
    "CLOSED",
  ],
  NEGOTIATION: ["QUALIFIED", "CONVERTED", "NOT_INTERESTED", "LOST", "CLOSED"],
  CONVERTED: ["CLOSED"],
  NOT_INTERESTED: ["NEW", "CLOSED"],
  LOST: ["NEW", "CLOSED"],
  SPAM: ["NEW", "CLOSED"],
  CLOSED: ["NEW"],
};

function ref(prefix: string) {
  return [
    prefix,
    new Date().getUTCFullYear(),
    randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase(),
  ].join("-");
}

function futureWindow({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }) {
  const now = Date.now();
  const duration = endsAt.getTime() - startsAt.getTime();
  if (
    startsAt.getTime() <= now ||
    startsAt.getTime() > now + 180 * 86400000 ||
    duration < 15 * 60000 ||
    duration > 8 * 3600000
  ) {
    throw new BadRequestException(
      "Choose a future time within 180 days and a duration of 15 minutes to 8 hours",
    );
  }
}

async function assign(
  tx: Prisma.TransactionClient,
  email: string | null | undefined,
) {
  if (!email) return null;
  const staff = await tx.user.findFirst({
    where: {
      email,
      active: true,
      roles: {
        some: {
          role: { permissions: { some: { permissionCode: "staff:access" } } },
        },
      },
    },
    select: { id: true },
  });
  if (!staff)
    throw new BadRequestException("Assignee must be an active staff account");
  return staff.id;
}

async function reservable(
  tx: Prisma.TransactionClient,
  slug: string,
  allowDemo = false,
) {
  const row = await tx.listing.findFirst({
    where: {
      slug,
      AND: [
        publicListingWhere(new Date()),
        ...(!allowDemo ? [{ isDemo: false }] : []),
      ],
    },
    select: { id: true, title: true },
  });
  if (!row) throw new NotFoundException("Listing unavailable");
  return row;
}

@Injectable()
export class EngagementService {
  constructor(private readonly prisma: PrismaService) {}

  profile(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: profileFields,
    });
  }
  updateProfile(userId: string, data: z.infer<typeof profile>) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: profileFields,
    });
  }

  async favourites(userId: string) {
    const rows = await this.prisma.favourite.findMany({
      where: { userId, listing: publicListingWhere(new Date()) },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { listing: { select: listingSummary } },
    });
    return rows.map((row) => row.listing);
  }
  async favourite(userId: string, slug: string) {
    const { id: listingId } = await reservable(this.prisma, slug, true);
    await this.prisma.favourite.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }
  async removeFavourite(userId: string, slug: string) {
    await this.prisma.favourite.deleteMany({
      where: { userId, listing: { slug } },
    });
  }
  searches(userId: string) {
    return this.prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, name: true, query: true },
    });
  }
  async saveSearch(userId: string, input: z.infer<typeof saveSearch>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(input.filters))
      if (
        value !== undefined &&
        value !== "" &&
        key !== "page" &&
        key !== "pageSize"
      )
        params.set(key, String(value));
    params.sort();
    const query = params.toString();
    return this.prisma.savedSearch.upsert({
      where: { userId_query: { userId, query } },
      create: { userId, name: input.name, query },
      update: { name: input.name },
      select: { id: true, name: true, query: true },
    });
  }
  async removeSearch(userId: string, id: string) {
    if (
      !(await this.prisma.savedSearch.deleteMany({ where: { userId, id } }))
        .count
    )
      throw new NotFoundException("Saved search not found");
  }

  enquiries(userId: string) {
    return this.prisma.enquiry.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: leadSummary,
    });
  }

  submitEnquiry(
    input: z.infer<typeof enquiry>,
    principal?: { id: string; email: string },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const listing = await reservable(tx, input.slug);
      const item = await tx.enquiry.create({
        data: {
          reference: ref("ENQ"),
          listingId: listing.id,
          customerId: principal?.id ?? null,
          name: input.name,
          email: principal?.email ?? input.email,
          phone: input.phone ?? null,
          channel: input.channel,
          message: input.message,
          consentAt: new Date(),
          activity: {
            create: { actorId: principal?.id ?? null, type: "SUBMITTED" },
          },
        },
        select: { id: true, reference: true },
      });
      if (principal)
        await notify(
          tx,
          principal.id,
          `enquiry:${item.id}:submitted`,
          "Enquiry received",
          `We received your enquiry ${item.reference}.`,
        );
      return { reference: item.reference };
    });
  }

  staffEnquiries(input: z.infer<typeof enquiryFilters>) {
    return this.prisma.enquiry.findMany({
      where: input.status ? { status: input.status } : {},
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * 25,
      take: 25,
      include: staffLeadSummary,
    });
  }

  changeEnquiry(
    id: string,
    input: z.infer<typeof staffEnquiry>,
    actorId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const previous = await tx.enquiry.findUnique({ where: { id } });
      if (!previous) throw new NotFoundException("Enquiry not found");
      if (
        previous.status !== input.status &&
        !leadSteps[previous.status].includes(input.status)
      )
        throw new ConflictException("This enquiry cannot move to that status");
      const assigneeId = await assign(tx, input.assigneeEmail);
      const changed = await tx.enquiry.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.status,
          assigneeId,
          followUpAt: input.followUpAt,
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        throw new ConflictException("Enquiry changed. Reload and try again.");
      await tx.enquiryActivity.create({
        data: {
          enquiryId: id,
          actorId,
          type: `UPDATE ${previous.status} → ${input.status}`,
        },
      });
      if (input.privateNote)
        await tx.enquiryActivity.create({
          data: {
            enquiryId: id,
            actorId,
            type: "PRIVATE_NOTE",
            note: input.privateNote,
          },
        });
      if (
        previous.customerId &&
        previous.status !== input.status &&
        input.status !== "SPAM"
      ) {
        await notify(
          tx,
          previous.customerId,
          `enquiry:${id}:${input.version + 1}`,
          "Enquiry updated",
          `Your enquiry ${previous.reference} has been updated.`,
        );
      }
      return tx.enquiry.findUniqueOrThrow({
        where: { id },
        include: staffLeadSummary,
      });
    });
  }

  appointments(userId: string) {
    return this.prisma.appointment.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: appointmentSummary,
    });
  }

  requestAppointment(userId: string, input: z.infer<typeof askAppointment>) {
    futureWindow(input.window);
    return this.prisma.$transaction(async (tx) => {
      const listing = await reservable(tx, input.slug);
      const item = await tx.appointment.create({
        data: {
          ...input.window,
          reference: ref("APT"),
          customerId: userId,
          listingId: listing.id,
          notes: input.notes,
          activity: { create: { status: "REQUESTED", actorId: userId } },
        },
        select: appointmentSummary,
      });
      await notify(
        tx,
        userId,
        `appointment:${item.id}:requested`,
        "Appointment requested",
        `We received appointment request ${item.reference}.`,
      );
      return item;
    });
  }

  staffAppointments(input: z.infer<typeof appointmentFilters>) {
    return this.prisma.appointment.findMany({
      where: input.status ? { status: input.status } : {},
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
      skip: (input.page - 1) * 25,
      take: 25,
      select: staffAppointmentSummary,
    });
  }

  changeAppointment(
    id: string,
    input: z.infer<typeof changeAppointment>,
    actorId: string,
    owned = false,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.appointment.findFirst({
          where: { id, ...(owned && { customerId: actorId }) },
        });
        if (!row) throw new NotFoundException("Appointment not found");
        if (!appointmentSteps[row.status].includes(input.status))
          throw new ConflictException(
            "This appointment cannot move to that status",
          );
        const book = liveSlots.includes(input.status);
        if (
          !book &&
          (input.window !== undefined || input.assigneeEmail !== undefined)
        )
          throw new BadRequestException(
            "Only confirmations and reschedules can change the appointment slot",
          );
        if (input.status === "RESCHEDULED" && !input.window)
          throw new BadRequestException("Provide the replacement time");
        const window = input.window ?? {
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          timeZone: row.timeZone,
        };
        const assigneeId =
          input.assigneeEmail === undefined
            ? row.assigneeId
            : await assign(tx, input.assigneeEmail);
        if (book) {
          if (!assigneeId)
            throw new BadRequestException(
              "Assign a staff member to book this appointment",
            );
          futureWindow(window);
          const keys = [
            `appointment:staff:${assigneeId}`,
            `appointment:customer:${row.customerId}`,
          ].sort();
          for (const key of keys)
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          const overlap = await tx.appointment.findFirst({
            where: {
              id: { not: id },
              status: { in: liveSlots },
              startsAt: { lt: window.endsAt },
              endsAt: { gt: window.startsAt },
              OR: [{ assigneeId }, { customerId: row.customerId }],
            },
            select: { id: true },
          });
          if (overlap)
            throw new ConflictException(
              "The staff member or customer already has an appointment during this window",
            );
        }
        if (
          (input.status === "COMPLETED" || input.status === "NO_SHOW") &&
          row.startsAt > new Date()
        )
          throw new ConflictException("This appointment has not started");
        const changed = await tx.appointment.updateMany({
          where: {
            id,
            version: input.version,
            ...(owned && { customerId: actorId }),
          },
          data: {
            ...window,
            assigneeId,
            status: input.status,
            version: { increment: 1 },
          },
        });
        if (!changed.count)
          throw new ConflictException(
            "Appointment changed. Reload and try again.",
          );
        await tx.appointmentActivity.create({
          data: { appointmentId: id, actorId, status: input.status },
        });
        await notify(
          tx,
          row.customerId,
          `appointment:${id}:${input.version + 1}`,
          "Appointment updated",
          `Appointment ${row.reference} is now ${input.status.toLowerCase().replaceAll("_", " ")}.`,
        );
        return tx.appointment.findUniqueOrThrow({
          where: { id },
          select: appointmentSummary,
        });
      },
      { timeout: 10_000 },
    );
  }

  async inbox(userId: string) {
    const [items, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          message: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }
  async markRead(userId: string, id: string) {
    const item = await this.prisma.notification.findFirst({
      where: { userId, id },
      select: { id: true },
    });
    if (!item) throw new NotFoundException("Notification not found");
    await this.prisma.notification.updateMany({
      where: { userId, id, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
