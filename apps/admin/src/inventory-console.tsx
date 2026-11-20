"use client";

import {
  actions,
  categories,
  Listing,
  Location,
  statuses,
} from "@marketplace/inventory";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  CalendarDays,
  CreditCard,
  Files,
  Handshake,
  Menu,
  MessagesSquare,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, ApiError, label, message, Staff } from "./api";
import { EditorialPanel, ReportsPanel } from "./editorial-panel";
import { ServicesPanel } from "./services-panel";
import { CommercePanel } from "./commerce-panel";
import { EngagementPanel } from "./engagement-panel";
import { ListingEditor } from "./listing-editor";

const workspaceSections = [
  { id: "inventory", title: "Inventory", icon: Package, permissions: [] },
  {
    id: "enquiries",
    title: "Enquiries",
    icon: MessagesSquare,
    permissions: ["engagement:crm"],
  },
  {
    id: "appointments",
    title: "Appointments",
    icon: CalendarDays,
    permissions: ["engagement:bookings"],
  },
  {
    id: "commerce",
    title: "Commerce",
    icon: CreditCard,
    permissions: ["commerce:reconcile", "commerce:refund"],
  },
  {
    id: "services",
    title: "Professional services",
    icon: Handshake,
    permissions: ["services:manage"],
  },
  {
    id: "content",
    title: "Content",
    icon: Files,
    permissions: ["content:manage"],
  },
  {
    id: "reports",
    title: "Reports",
    icon: BarChart3,
    permissions: ["analytics:read"],
  },
  { id: "access", title: "Staff access", icon: ShieldCheck, permissions: [] },
] as const;

type Section = (typeof workspaceSections)[number]["id"];
type Page = { items: Listing[]; total: number; page: number; pageSize: number };

function SignIn({
  onLogin,
  initialError,
}: {
  onLogin: (staff: Staff) => void;
  initialError: string;
}) {
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api("/auth/login", "POST", {
        email: data.get("email"),
        password: data.get("password"),
      });
      onLogin(await api<Staff>("/admin/access"));
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="staff-auth">
      <div className="signin">
        <div className="brand">
          <span>CUV</span> Marketplace
        </div>
        <h1>Staff sign in</h1>
        <form onSubmit={submit} className="stack">
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

export function InventoryConsole() {
  const [staff, setStaff] = useState<Staff>();
  const [section, setSection] = useState<Section>("inventory");
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [result, setResult] = useState<Page>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<string[]>([]);
  const [editor, setEditor] = useState<Listing | "new">();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [locationForm, setLocationForm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.resolve()
      .then(() => api<Staff>("/admin/access"))
      .then((value) => {
        if (active) setStaff(value);
      })
      .catch((failure) => {
        if (
          active &&
          (!(failure instanceof ApiError) || failure.status !== 401)
        )
          setAuthError(message(failure));
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const allow = (name: string) =>
    staff?.permissions.includes(`inventory:${name}`) ?? false;

  const refresh = useCallback(
    async (alive: () => boolean = () => true) => {
      if (!staff?.permissions.includes("inventory:read")) return;
      setLoading(true);
      setError("");
      try {
        const [list, places] = await Promise.all([
          api<Page>(`/admin/listings?page=${page}&${query}`),
          api<Location[]>("/admin/locations"),
        ]);
        if (alive()) {
          if (list.total > 0 && list.items.length === 0 && page > 1) {
            setPage(Math.ceil(list.total / list.pageSize));
            return;
          }
          setResult(list);
          setLocations(places);
          setSelection([]);
        }
      } catch (failure) {
        if (alive()) {
          if (failure instanceof ApiError && failure.status === 401)
            setStaff(undefined);
          setError(message(failure));
        }
      } finally {
        if (alive()) setLoading(false);
      }
    },
    [staff, query, page],
  );

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) void refresh(() => active);
    });
    return () => {
      active = false;
    };
  }, [refresh]);

  async function signOut() {
    try {
      await api("/auth/logout", "POST");
      setStaff(undefined);
      setSection("inventory");
      setEditor(undefined);
      setResult(undefined);
      setAuthError("");
    } catch (failure) {
      setError(message(failure));
    }
  }

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget))
      if (value) params.set(key, String(value));
    setPage(1);
    setSelection([]);
    setQuery(params.toString());
  }

  async function bulkUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const action = String(new FormData(event.currentTarget).get("action"));
    if (
      !result ||
      !selection.length ||
      !window.confirm(
        `${label(action)} ${selection.length} selected listing(s)?`,
      )
    )
      return;
    setBusy(true);
    setNotice("");
    try {
      const listings = result.items
        .filter(({ id }) => selection.includes(id))
        .map(({ id, version }) => ({ id, version }));
      const changed = await api<{ count: number }>(
        "/admin/listings/bulk",
        "POST",
        { action, listings },
      );
      await refresh();
      setNotice(`${changed.count} listing(s) updated.`);
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  async function addLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api(
        "/admin/locations",
        "POST",
        Object.fromEntries(new FormData(event.currentTarget)),
      );
      await refresh();
      setLocationForm(false);
      setNotice("Location saved.");
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  if (checking)
    return (
      <main className="signin">
        <p role="status">Checking your session…</p>
      </main>
    );
  if (!staff) return <SignIn onLogin={setStaff} initialError={authError} />;

  const links = workspaceSections
    .filter(
      ({ permissions }) =>
        !permissions.length ||
        permissions.some((permission) =>
          staff.permissions.includes(permission),
        ),
    )
    .map(({ id, title, icon: Icon }) => (
      <button
        key={id}
        type="button"
        title={title}
        aria-label={title}
        aria-current={section === id ? "page" : undefined}
        onClick={() => {
          setSection(id);
          setMenuOpen(false);
        }}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{title}</span>
      </button>
    ));

  return (
    <>
      <a className="staff-skip" href="#workspace">
        Skip to workspace
      </a>
      <header className="top">
        <div className="top-inner">
          <div className="staff-top-actions">
            <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
              <Dialog.Trigger
                className="staff-mobile-trigger"
                aria-label="Open staff navigation"
              >
                <Menu size={20} />
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="staff-menu-overlay" />
                <Dialog.Content className="staff-menu">
                  <div className="staff-menu-head">
                    <Dialog.Title>Staff workspace</Dialog.Title>
                    <Dialog.Close aria-label="Close staff navigation">
                      <X size={20} />
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="staff-sr-only">
                    Choose a section of the staff workspace.
                  </Dialog.Description>
                  <nav className="staff-nav" aria-label="Staff workspace">
                    {links}
                  </nav>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <div className="brand">
              <span>CUV</span> Staff workspace
            </div>
          </div>
          <div className="account">
            <span>{staff.email}</span>
            <button onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>
      <div className="staff-shell" data-collapsed={collapsed}>
        <aside className="staff-sidebar">
          <button
            type="button"
            className="staff-collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>Collapse navigation</span>
          </button>
          <nav className="staff-nav" aria-label="Staff workspace">
            {links}
          </nav>
        </aside>
        <main className="shell staff-content" id="workspace">
          {section === "access" ? (
            <section className="surface staff-access">
              <h1>Staff access</h1>
              <p>{staff.email}</p>
              <h2>Assigned roles</h2>
              <ul>
                {staff.roles.map((role) => (
                  <li key={role}>{label(role)}</li>
                ))}
              </ul>
              <h2>Granted permissions</h2>
              <ul>
                {staff.permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
            </section>
          ) : section === "content" ? (
            <EditorialPanel />
          ) : section === "reports" ? (
            <ReportsPanel permissions={staff.permissions} />
          ) : section === "services" ? (
            <ServicesPanel />
          ) : section === "commerce" ? (
            <CommercePanel permissions={staff.permissions} />
          ) : section !== "inventory" ? (
            <EngagementPanel key={section} mode={section} />
          ) : (
            <>
              {error && (
                <p role="alert" className="notice error">
                  {error}{" "}
                  <button onClick={() => void refresh()}>
                    Reload inventory
                  </button>
                </p>
              )}
              {notice && (
                <p role="status" className="notice">
                  {notice}
                </p>
              )}
              {!allow("read") ? (
                <p className="notice error">
                  Your staff role does not have inventory access.
                </p>
              ) : editor ? (
                <ListingEditor
                  key={editor === "new" ? "new" : editor.id}
                  initial={editor}
                  locations={locations}
                  permissions={staff.permissions}
                  onClose={() => {
                    setEditor(undefined);
                    void refresh();
                  }}
                  onSaved={(listing) => setEditor(listing)}
                />
              ) : (
                <>
                  <div className="heading">
                    <div>
                      <h1>Inventory</h1>
                      <p>
                        {loading
                          ? "Loading inventory…"
                          : `${result?.total ?? 0} ${result?.total === 1 ? "listing" : "listings"}`}
                      </p>
                    </div>
                    <div className="actions">
                      {allow("write") && (
                        <>
                          <button
                            type="button"
                            onClick={() => setLocationForm(!locationForm)}
                          >
                            {locationForm ? "Close locations" : "Add location"}
                          </button>
                          <button
                            className="primary"
                            onClick={() => setEditor("new")}
                          >
                            New listing
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {locationForm && (
                    <form className="surface filters" onSubmit={addLocation}>
                      <label>
                        Country code
                        <input
                          name="country"
                          defaultValue="NG"
                          maxLength={2}
                          required
                        />
                      </label>
                      <label>
                        State or region
                        <input name="region" maxLength={100} required />
                      </label>
                      <label>
                        City
                        <input name="city" maxLength={100} required />
                      </label>
                      <button className="primary" disabled={busy}>
                        Save location
                      </button>
                    </form>
                  )}
                  <section className="surface" aria-label="Inventory listings">
                    <form className="filters" onSubmit={filter}>
                      <label>
                        Search
                        <input
                          name="q"
                          placeholder="Title or reference"
                          maxLength={150}
                        />
                      </label>
                      <label>
                        Category
                        <select name="category">
                          <option value="">All categories</option>
                          {categories.map((value) => (
                            <option value={value} key={value}>
                              {label(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Status
                        <select name="status">
                          <option value="">All statuses</option>
                          {statuses.map((value) => (
                            <option value={value} key={value}>
                              {label(value)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Location
                        <select name="locationId">
                          <option value="">All locations</option>
                          {locations.map(({ id, city, region }) => (
                            <option key={id} value={id}>
                              {city}, {region}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Featured
                        <select name="featured">
                          <option value="">All</option>
                          <option value="true">Featured</option>
                          <option value="false">Regular</option>
                        </select>
                      </label>
                      <button>Apply filters</button>
                    </form>
                    {selection.length > 0 && (
                      <form className="bulk" onSubmit={bulkUpdate}>
                        <span>{selection.length} selected</span>
                        <select name="action" aria-label="Bulk action">
                          {allow("write") && (
                            <>
                              <option value="feature">Feature</option>
                              <option value="unfeature">Remove featured</option>
                            </>
                          )}
                          {allow("publish") &&
                            actions.map((action) => (
                              <option key={action} value={action}>
                                {label(action)}
                              </option>
                            ))}
                        </select>
                        <button disabled={busy || loading}>Apply action</button>
                      </form>
                    )}
                    {loading && (
                      <p className="empty" role="status">
                        Refreshing listings…
                      </p>
                    )}
                    {!loading && result && result.items.length === 0 && (
                      <p className="empty">No listings match these filters.</p>
                    )}
                    {!loading && result && result.items.length > 0 && (
                      <>
                        <div
                          className="table-wrap"
                          tabIndex={0}
                          role="region"
                          aria-label="Inventory table"
                        >
                          <table>
                            <thead>
                              <tr>
                                {(allow("write") || allow("publish")) && (
                                  <th scope="col">
                                    <span className="sr-only">Select</span>
                                  </th>
                                )}
                                <th scope="col">Listing</th>
                                <th scope="col">Category</th>
                                <th scope="col">Location</th>
                                <th scope="col">Status</th>
                                <th scope="col">Updated</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.items.map((listing) => (
                                <tr key={listing.id}>
                                  {(allow("write") || allow("publish")) && (
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={selection.includes(listing.id)}
                                        aria-label={`Select ${listing.title}`}
                                        onChange={(event) =>
                                          setSelection((selected) =>
                                            event.target.checked
                                              ? [...selected, listing.id]
                                              : selected.filter(
                                                  (id) => id !== listing.id,
                                                ),
                                          )
                                        }
                                      />
                                    </td>
                                  )}
                                  <td>
                                    <button
                                      className="text-button"
                                      onClick={() => {
                                        setNotice("");
                                        setEditor(listing);
                                      }}
                                    >
                                      {listing.title}
                                    </button>
                                    <small>
                                      {listing.reference}
                                      {listing.featured && " · Featured"}
                                    </small>
                                  </td>
                                  <td>{label(listing.category)}</td>
                                  <td>
                                    {listing.location
                                      ? `${listing.location.city}, ${listing.location.region}`
                                      : "—"}
                                  </td>
                                  <td>
                                    <span
                                      className="badge"
                                      data-status={listing.status}
                                    >
                                      {label(listing.status)}
                                    </span>
                                  </td>
                                  <td>
                                    {new Date(
                                      listing.updatedAt,
                                    ).toLocaleDateString("en-NG")}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="pager">
                          <button
                            disabled={page === 1}
                            onClick={() => setPage(page - 1)}
                          >
                            Previous
                          </button>
                          <span>
                            Page {page} of{" "}
                            {Math.ceil(result.total / result.pageSize)}
                          </span>
                          <button
                            disabled={page * result.pageSize >= result.total}
                            onClick={() => setPage(page + 1)}
                          >
                            Next
                          </button>
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
