import type { Category } from "@marketplace/inventory";

export const collections: Record<
  Category,
  { image: string; introduction: string; theme: string }
> = {
  PROPERTY: {
    image: "/collections/property.webp",
    introduction:
      "Explore residential and commercial spaces, from city homes to places for your business.",
    theme: "property",
  },
  LAND: {
    image: "/collections/land.webp",
    introduction:
      "Compare residential plots and development sites by location, area and intended use.",
    theme: "land",
  },
  VEHICLE: {
    image: "/collections/vehicle.webp",
    introduction:
      "Find your next car or utility vehicle by make, transmission and location.",
    theme: "vehicle",
  },
  SERVICE: {
    image: "/collections/service.webp",
    introduction:
      "Find planning, design and development expertise for your next project.",
    theme: "service",
  },
};
