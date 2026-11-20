import { PrismaClient } from "@prisma/client";
import type { ListingInput } from "@marketplace/inventory";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const records = [
  {
    category: "PROPERTY",
    title: "Courtyard residence in Lekki",
    city: "Lekki",
    region: "Lagos",
    priceMinor: "12500000000",
    details: {
      propertyType: "RESIDENTIAL",
      offer: "SALE",
      bedrooms: 4,
      bathrooms: 4,
      buildingAreaSqm: 310,
    },
    description:
      "An illustrative four-bedroom residence with a shaded courtyard, open living spaces and a private garden.",
    alt: "Illustration of a cream courtyard residence framed by palms",
  },
  {
    category: "LAND",
    title: "Hillside residential plot in Kuje",
    city: "Kuje",
    region: "Federal Capital Territory",
    priceMinor: "1850000000",
    details: {
      landUse: "Residential",
      area: 820,
      areaUnit: "SQM",
      titleType: "Example title",
      titleVerification: "UNVERIFIED",
      terrain: "Gently sloping",
    },
    description:
      "An illustrative residential parcel with a gradual slope and open views toward the surrounding hills.",
    alt: "Illustration of an open green parcel with a red earth track",
  },
  {
    category: "VEHICLE",
    title: "Graphite compact SUV in Ikeja",
    city: "Ikeja",
    region: "Lagos",
    priceMinor: "2450000000",
    details: {
      make: "Example Motors",
      model: "Terrain",
      year: 2022,
      mileageKm: 38500,
      transmission: "Automatic",
      fuel: "Petrol",
      condition: "Illustrative pre-owned condition",
    },
    description:
      "A synthetic example of a compact SUV listing with an automatic transmission and a practical five-seat cabin.",
    alt: "Illustration of a graphite compact SUV on a quiet road",
  },
  {
    category: "SERVICE",
    title: "Urban planning and site feasibility",
    city: "Abuja",
    region: "Federal Capital Territory",
    priceMinor: null,
    details: {
      serviceType: "Urban planning",
      scope: "Site assessment and initial development feasibility",
      pricingModel: "QUOTE",
      areaServed: "Federal Capital Territory",
      deliverables: "Constraints summary and indicative site layout",
    },
    description:
      "An example planning service covering early site constraints, a concept layout and next steps for development.",
    alt: "Illustration of an architectural studio with plans and a scale model",
  },
] as const;

const detailsKey = {
  PROPERTY: "property",
  LAND: "land",
  VEHICLE: "vehicle",
  SERVICE: "service",
} as const;

async function seed() {
  if (process.env.NODE_ENV !== "development")
    throw new Error("Demo seeding requires NODE_ENV=development");
  const prisma = new PrismaClient();
  const directory = resolve(process.env.MEDIA_LOCAL_DIR || ".local-media");
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const actor = await prisma.user.upsert({
      where: { email: "demo-catalog@example.test" },
      create: {
        email: "demo-catalog@example.test",
        active: false,
        passwordHash: "disabled-demo-fixture",
      },
      update: {},
      select: { id: true },
    });
    for (const [index, item] of records.entries()) {
      const category = item.category;
      const slug = "demo-" + category.toLowerCase();
      const location = await prisma.location.upsert({
        where: {
          key: JSON.stringify([
            "NG",
            item.region.toLowerCase(),
            item.city.toLowerCase(),
          ]),
        },
        create: {
          country: "NG",
          region: item.region,
          city: item.city,
          key: JSON.stringify([
            "NG",
            item.region.toLowerCase(),
            item.city.toLowerCase(),
          ]),
        },
        update: {},
      });
      const existing = await prisma.listing.findUnique({
        where: { slug },
        select: { isDemo: true },
      });
      if (existing) {
        if (!existing.isDemo)
          throw new Error("Demo slug already belongs to another listing");
        continue;
      }
      const key = randomUUID();
      const file = join(directory, key);
      await writeFile(
        file,
        await readFile(
          resolve("prisma/demo-media", category.toLowerCase() + ".webp"),
        ),
        { flag: "wx", mode: 0o600 },
      );
      try {
        await prisma.listing.create({
          data: {
            slug,
            category,
            title: item.title,
            description: item.description,
            currency: "NGN",
            priceMinor: item.priceMinor ? BigInt(item.priceMinor) : null,
            locationId: location.id,
            reference: `${({ PROPERTY: "PROP", LAND: "LAND", VEHICLE: "VEH", SERVICE: "SVC" } as const)[category]}-2026-D0000${index + 1}`,
            createdById: actor.id,
            publishedById: actor.id,
            publishedAt: new Date(),
            status: "PUBLISHED",
            isDemo: true,
            featured: index % 2 === 0,
            [detailsKey[category]]: {
              create: { data: item.details as ListingInput["details"] },
            },
            media: {
              create: {
                objectKey: key,
                kind: "IMAGE",
                contentType: "image/webp",
                state: "READY",
                alt: item.alt,
                cover: true,
                position: 0,
              },
            },
            audit: {
              create: { actorId: actor.id, action: "DEMO_SEED", metadata: {} },
            },
          },
        });
      } catch (error) {
        await unlink(file).catch(() => undefined);
        throw error;
      }
    }
    console.log("Synthetic catalog fixtures are ready.");
  } finally {
    await prisma.$disconnect();
  }
}
void seed().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith("Demo ")
      ? error.message
      : "Demo seeding failed",
  );
  process.exitCode = 1;
});
