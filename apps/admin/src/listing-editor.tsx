import {
  availableActions,
  categories,
  Category,
  Listing,
  listingInput,
  ListingMedia,
  Location,
} from "@marketplace/inventory";
import { FormEvent, ReactNode, useState } from "react";
import { api, label, mediaUrl, message } from "./api";

type Field = [name: string, label: string, type?: "number" | readonly string[]];
const fields: Record<Category, Field[]> = {
  PROPERTY: [
    ["propertyType", "Property type", ["RESIDENTIAL", "COMMERCIAL"]],
    ["offer", "Offer", ["SALE", "RENT"]],
    ["bedrooms", "Bedrooms", "number"],
    ["bathrooms", "Bathrooms", "number"],
    ["toilets", "Toilets", "number"],
    ["parking", "Parking spaces", "number"],
    ["buildingAreaSqm", "Building area (m²)", "number"],
    ["landAreaSqm", "Land area (m²)", "number"],
    ["furnishing", "Furnishing"],
    ["amenities", "Amenities"],
    ["yearBuilt", "Year built", "number"],
  ],
  LAND: [
    ["landUse", "Land use"],
    ["area", "Area", "number"],
    ["areaUnit", "Area unit", ["SQM", "HECTARE", "ACRE"]],
    ["dimensions", "Dimensions"],
    ["zoning", "Zoning"],
    ["terrain", "Terrain"],
    ["roadAccess", "Road access"],
    ["utilities", "Utilities"],
    ["titleType", "Title type"],
    [
      "titleVerification",
      "Title verification",
      ["UNVERIFIED", "DOCUMENT_REVIEWED"],
    ],
    ["estate", "Estate"],
  ],
  VEHICLE: [
    ["make", "Make"],
    ["model", "Model"],
    ["year", "Year", "number"],
    ["mileageKm", "Mileage (km)", "number"],
    ["transmission", "Transmission"],
    ["fuel", "Fuel"],
    ["bodyType", "Body type"],
    ["engineCapacityCc", "Engine capacity (cc)", "number"],
    ["color", "Colour"],
    ["condition", "Condition"],
    ["registration", "Registration status"],
    ["disclosures", "Disclosures"],
    ["vin", "VIN (staff only)"],
  ],
  SERVICE: [
    ["serviceType", "Service type"],
    ["scope", "Scope"],
    ["pricingModel", "Pricing model", ["FIXED", "STARTING", "QUOTE"]],
    ["deliverables", "Deliverables"],
    ["areaServed", "Area served"],
    ["duration", "Indicative duration"],
    ["requirements", "Requirements"],
  ],
};

function localDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function MediaPreview({
  listingId,
  media,
}: {
  listingId: string;
  media: ListingMedia;
}) {
  const src = mediaUrl(listingId, media.id);
  return media.state !== "READY" ? (
    <p>{label(media.state)}</p>
  ) : media.kind === "IMAGE" ? (
    <img
      src={src}
      alt={media.alt || "Listing media"}
      loading="lazy"
      crossOrigin="use-credentials"
    />
  ) : (
    <video
      src={src}
      aria-label={media.alt || "Listing video"}
      crossOrigin="use-credentials"
      controls
      preload="metadata"
    />
  );
}

function Gallery({
  listing,
  editable,
  busy,
  mutate,
}: {
  listing: Listing;
  editable: boolean;
  busy: boolean;
  mutate: (request: () => Promise<Listing>, success: string) => Promise<void>;
}) {
  const [items, setItems] = useState(listing.media);
  const path = `/admin/listings/${listing.id}/media`;
  function change(id: string, update: (item: ListingMedia) => ListingMedia) {
    setItems((current) =>
      current.map((item) => (item.id === id ? update(item) : item)),
    );
  }
  function move(position: number, delta: number) {
    setItems((current) => {
      const next = [...current];
      const item = next[position];
      const adjacent = next[position + delta];
      if (item && adjacent) {
        next[position] = adjacent;
        next[position + delta] = item;
      }
      return next;
    });
  }
  return (
    <section className="surface panel">
      <h2>Media</h2>
      {editable && (
        <form
          className="filters upload"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            data.set("version", String(listing.version));
            void mutate(
              () => api<Listing>(path, "POST", data),
              "File uploaded.",
            );
          }}
        >
          <label>
            Upload image or MP4
            <input
              type="file"
              name="file"
              accept="image/jpeg,image/png,image/webp,video/mp4"
              required
            />
          </label>
          <label>
            Alternative text
            <input name="alt" required maxLength={300} />
          </label>
          <button disabled={busy}>Upload</button>
        </form>
      )}
      {items.length === 0 && <p className="muted">No media added.</p>}
      <ol className="gallery">
        {items.map((item, index) => (
          <li key={item.id}>
            <MediaPreview listingId={listing.id} media={item} />
            {editable ? (
              <>
                <label>
                  Alternative text
                  <input
                    value={item.alt}
                    maxLength={300}
                    onChange={(event) =>
                      change(item.id, (entry) => ({
                        ...entry,
                        alt: event.target.value,
                      }))
                    }
                  />
                </label>
                {item.kind === "IMAGE" && item.state === "READY" && (
                  <label className="check">
                    <input
                      type="radio"
                      name="cover"
                      checked={item.cover}
                      onChange={() =>
                        setItems((current) =>
                          current.map((entry) => ({
                            ...entry,
                            cover: entry.id === item.id,
                          })),
                        )
                      }
                    />{" "}
                    Cover image
                  </label>
                )}
                <div className="actions">
                  <button
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    disabled={index === items.length - 1 || busy}
                    onClick={() => move(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Remove this file from the listing?"))
                        void mutate(
                          () =>
                            api<Listing>(`${path}/${item.id}`, "DELETE", {
                              version: listing.version,
                            }),
                          "File removed.",
                        );
                    }}
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <p>
                {item.alt}
                {item.cover && " · Cover image"}
              </p>
            )}
          </li>
        ))}
      </ol>
      {editable && items.length > 0 && (
        <button
          disabled={busy}
          onClick={() =>
            void mutate(
              () =>
                api<Listing>(path, "PATCH", {
                  version: listing.version,
                  items: items.map(({ id, alt, cover }) => ({
                    id,
                    alt,
                    cover,
                  })),
                }),
              "Gallery saved.",
            )
          }
        >
          Save gallery
        </button>
      )}
    </section>
  );
}

type Audit = {
  id: string;
  action: string;
  actorId: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export function ListingEditor({
  initial,
  locations,
  permissions,
  onClose,
  onSaved,
}: {
  initial: Listing | "new";
  locations: Location[];
  permissions: string[];
  onClose: () => void;
  onSaved: (listing: Listing) => void;
}) {
  const listing = initial === "new" ? undefined : initial;
  const [category, setCategory] = useState<Category>(
    listing?.category ?? "PROPERTY",
  );
  const [view, setView] = useState<"edit" | "preview" | "audit">("edit");
  const [activity, setActivity] = useState<Audit[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const allow = (name: string) => permissions.includes(`inventory:${name}`);
  const open =
    !listing ||
    ["DRAFT", "PUBLISHED", "UNPUBLISHED", "RESERVED", "EXPIRED"].includes(
      listing.status,
    );
  const editable = open && allow("write");
  const path = listing ? `/admin/listings/${listing.id}` : "/admin/listings";
  const details = (listing?.details ?? {}) as Record<string, string | number>;
  const lifecycle =
    listing && allow("publish") ? availableActions(listing) : [];

  async function mutate(request: () => Promise<Listing>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      onSaved(await request());
      setNotice(success);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const read = (name: string) => String(data.get(name) ?? "");
    const categoryDetails = Object.fromEntries(
      fields[category].flatMap(
        ([name, , type]): Array<[string, number | string]> => {
          const value = read(name).trim();
          return value
            ? [[name, type === "number" ? Number(value) : value]]
            : [];
        },
      ),
    );
    const expires = read("expiresAt");
    const parsed = listingInput.safeParse({
      category,
      details: categoryDetails,
      title: read("title"),
      description: read("description"),
      locationId: read("locationId") || null,
      priceMinor: read("priceMinor").trim() || null,
      currency: read("currency").trim().toUpperCase(),
      featured: data.has("featured"),
      expiresAt: expires ? new Date(expires).toISOString() : null,
      verificationScope: read("verificationScope"),
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(" · "),
      );
      return;
    }
    void mutate(
      () =>
        listing
          ? api<Listing>(path, "PATCH", {
              listing: parsed.data,
              version: listing.version,
            })
          : api<Listing>(path, "POST", parsed.data),
      listing ? "Listing saved." : "Draft created.",
    );
  }

  async function audit() {
    setView("audit");
    setActivity(undefined);
    setError("");
    try {
      setActivity(await api<Audit[]>(`${path}/audit`));
    } catch (failure) {
      setError(message(failure));
    }
  }

  let content: ReactNode;
  if (view === "preview" && listing) {
    const ordered = [...listing.media].sort(
      (a, b) => Number(b.cover) - Number(a.cover) || a.position - b.position,
    );
    content = (
      <section className="surface panel preview">
        <p className="muted">
          {label(listing.category)} · {listing.reference}
        </p>
        <h2>{listing.title}</h2>
        <p>
          {listing.location
            ? `${listing.location.city}, ${listing.location.region}`
            : "Location pending"}
        </p>
        <p className="price">
          {listing.priceMinor
            ? `${listing.currency} ${listing.priceMinor} minor units`
            : "Price on request"}
        </p>
        <div className="gallery">
          {ordered.map((media) => (
            <MediaPreview key={media.id} listingId={listing.id} media={media} />
          ))}
        </div>
        <p className="description">
          {listing.description || "Description pending"}
        </p>
        {listing.verificationScope && <p>{listing.verificationScope}</p>}
        <dl>
          {fields[listing.category]
            .filter(([name]) => name !== "vin" && details[name] !== undefined)
            .map(([name, title]) => (
              <div key={name}>
                <dt>{title}</dt>
                <dd>{details[name]}</dd>
              </div>
            ))}
        </dl>
      </section>
    );
  } else if (view === "audit" && listing) {
    content = (
      <section className="surface panel">
        <h2>Activity</h2>
        {activity ? (
          <ol className="activity">
            {activity.map((item) => (
              <li key={item.id}>
                <strong>{label(item.action)}</strong>
                <span>{new Date(item.createdAt).toLocaleString("en-NG")}</span>
                <small>Actor {item.actorId ?? "Unavailable"}</small>
                {"before" in item.metadata && (
                  <small>
                    {label(String(item.metadata.before))} to{" "}
                    {label(String(item.metadata.after))}
                  </small>
                )}
              </li>
            ))}
          </ol>
        ) : (
          !error && (
            <p className="staff-loading" role="status">
              Loading activity…
            </p>
          )
        )}
        {activity?.length === 0 && (
          <p className="staff-empty">No recorded activity.</p>
        )}
      </section>
    );
  } else {
    content = (
      <>
        <form
          className="surface panel stack"
          key={`details-${listing?.version ?? "draft"}`}
          onSubmit={save}
        >
          <fieldset disabled={!editable || busy} className="stack">
            <legend>Listing details</legend>
            <div className="form-grid">
              <label>
                Category
                <select
                  value={category}
                  disabled={Boolean(listing)}
                  onChange={(event) =>
                    setCategory(event.target.value as Category)
                  }
                >
                  {categories.map((value) => (
                    <option value={value} key={value}>
                      {label(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={160}
                  defaultValue={listing?.title}
                />
              </label>
              <label>
                Location
                <select
                  name="locationId"
                  defaultValue={listing?.locationId ?? ""}
                >
                  <option value="">Choose a location</option>
                  {locations.map(({ id, city, region, country }) => (
                    <option key={id} value={id}>
                      {city}, {region}, {country}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Price in minor units
                <input
                  name="priceMinor"
                  inputMode="numeric"
                  pattern="[0-9]{1,15}"
                  defaultValue={listing?.priceMinor ?? ""}
                />
              </label>
              <label>
                Currency
                <input
                  name="currency"
                  required
                  maxLength={3}
                  defaultValue={listing?.currency ?? "NGN"}
                />
              </label>
              <label>
                Expiry (local time)
                <input
                  type="datetime-local"
                  name="expiresAt"
                  defaultValue={localDate(listing?.expiresAt)}
                />
              </label>
            </div>
            <label>
              Description
              <textarea
                name="description"
                rows={4}
                maxLength={12000}
                defaultValue={listing?.description}
              />
            </label>
            <label>
              Verification scope
              <input
                name="verificationScope"
                maxLength={300}
                defaultValue={listing?.verificationScope}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                name="featured"
                defaultChecked={listing?.featured}
              />{" "}
              Featured listing
            </label>
          </fieldset>
          <fieldset
            disabled={!editable || busy}
            className="form-grid"
            key={category}
          >
            <legend>{label(category)} details</legend>
            {fields[category].map(([name, title, type]) => (
              <label key={name}>
                {title}
                {Array.isArray(type) ? (
                  <select name={name} defaultValue={details[name] ?? ""}>
                    <option value="">Select</option>
                    {type.map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name={name}
                    type={type === "number" ? "number" : "text"}
                    step={type === "number" ? "any" : undefined}
                    maxLength={name === "vin" ? 17 : 200}
                    defaultValue={details[name]}
                  />
                )}
              </label>
            ))}
          </fieldset>
          {editable && (
            <div>
              <button className="primary" disabled={busy}>
                {listing ? "Save changes" : "Create draft"}
              </button>
            </div>
          )}
        </form>
        {listing && (
          <Gallery
            key={`media-${listing.version}`}
            listing={listing}
            editable={open && allow("media")}
            busy={busy}
            mutate={mutate}
          />
        )}
      </>
    );
  }

  return (
    <div className="stack editor">
      <button className="text-button back" onClick={onClose}>
        ← Back to inventory
      </button>
      <div className="heading">
        <div>
          <h1>{listing?.title ?? "New listing"}</h1>
          {listing && (
            <p>
              {listing.reference}{" "}
              <span className="badge" data-status={listing.status}>
                {label(listing.status)}
              </span>
            </p>
          )}
        </div>
      </div>
      {listing && (
        <div className="editor-toolbar">
          <nav className="actions" aria-label="Listing views">
            <button
              aria-pressed={view === "edit"}
              onClick={() => setView("edit")}
            >
              Details &amp; media
            </button>
            <button
              aria-pressed={view === "preview"}
              onClick={() => setView("preview")}
            >
              Preview
            </button>
            {allow("audit") && (
              <button
                aria-pressed={view === "audit"}
                onClick={() => void audit()}
              >
                Activity
              </button>
            )}
          </nav>
          {lifecycle.length > 0 && (
            <form
              className="actions"
              onSubmit={(event) => {
                event.preventDefault();
                const action = String(
                  new FormData(event.currentTarget).get("action"),
                );
                if (
                  action &&
                  window.confirm(`${label(action)} this listing?`)
                ) {
                  setView("edit");
                  void mutate(
                    () =>
                      api<Listing>(`${path}/actions`, "POST", {
                        action,
                        version: listing.version,
                      }),
                    "Listing status updated.",
                  );
                }
              }}
            >
              <select
                name="action"
                aria-label="Listing status action"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Change status
                </option>
                {lifecycle.map((action) => (
                  <option key={action} value={action}>
                    {label(action)}
                  </option>
                ))}
              </select>
              <button disabled={busy}>Apply</button>
            </form>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="notice error">
          {error}{" "}
          {listing && (
            <button
              disabled={busy}
              onClick={() =>
                void mutate(
                  () => api<Listing>(path),
                  "Latest saved version loaded.",
                )
              }
            >
              Reload listing
            </button>
          )}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {content}
    </div>
  );
}
