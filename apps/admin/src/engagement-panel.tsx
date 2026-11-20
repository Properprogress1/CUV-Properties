"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, label, message } from "./api";
import { ClientContact } from "./client-contact";

const leadStatuses = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "INSPECTION_SCHEDULED",
  "NEGOTIATION",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
  "SPAM",
  "CLOSED",
];
const bookingStatuses = [
  "REQUESTED",
  "CONFIRMED",
  "RESCHEDULED",
  "CANCELLED",
  "COMPLETED",
  "NO_SHOW",
];
const actions: Record<string, string[]> = {
  REQUESTED: ["CONFIRMED", "RESCHEDULED", "CANCELLED"],
  CONFIRMED: ["RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"],
  RESCHEDULED: ["RESCHEDULED", "CANCELLED", "COMPLETED", "NO_SHOW"],
};
type Common = {
  id: string;
  reference: string;
  version: number;
  status: string;
  listing: { title: string };
  assignee: { email: string } | null;
};
type Lead = Common & {
  name: string;
  email: string;
  phone: string | null;
  channel: string;
  message: string;
  followUpAt: string | null;
  activity: {
    id: string;
    type: string;
    note: string | null;
    createdAt: string;
  }[];
};
type Booking = Common & {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  notes: string;
  customer: {
    email: string;
    displayName: string | null;
    phone?: string | null;
  };
  activity: { id: string; status: string; createdAt: string }[];
};
type Update = (id: string, body: object) => Promise<void>;

function localDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function LeadCard({
  item,
  busy,
  submit,
}: {
  item: Lead;
  busy: boolean;
  submit: Update;
}) {
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const followUp = data.get("followUpAt");
    void submit(item.id, {
      version: item.version,
      status: data.get("status"),
      assigneeEmail: data.get("assigneeEmail") || null,
      followUpAt: followUp ? new Date(String(followUp)).toISOString() : null,
      privateNote: data.get("privateNote"),
    });
  }
  return (
    <article className="surface panel stack">
      <div>
        <h2>{item.listing.title}</h2>
        <p>
          {item.reference} · {label(item.status)}
        </p>
      </div>
      <p>
        {item.name} · {item.email}
        {item.phone && " · " + item.phone} · Prefers {label(item.channel)}
      </p>
      <ClientContact
        email={item.email}
        phone={item.phone}
        reference={item.reference}
      />
      <p className="description">{item.message}</p>
      {item.followUpAt && new Date(item.followUpAt) < new Date() && (
        <p className="notice error">Follow-up overdue</p>
      )}
      <form onSubmit={save} className="stack">
        <div className="form-grid">
          <label>
            Lead status
            <select name="status" defaultValue={item.status}>
              {leadStatuses.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Assignee email
            <input
              name="assigneeEmail"
              type="email"
              defaultValue={item.assignee?.email ?? ""}
            />
          </label>
          <label>
            Follow-up (local time)
            <input
              name="followUpAt"
              type="datetime-local"
              defaultValue={localDate(item.followUpAt)}
            />
          </label>
        </div>
        <label>
          Private note
          <textarea name="privateNote" maxLength={2500} rows={2} />
        </label>
        <div>
          <button className="primary" disabled={busy}>
            Save enquiry
          </button>
        </div>
      </form>
      <details>
        <summary>Activity and private notes</summary>
        <ul className="activity">
          {item.activity.map((entry) => (
            <li key={entry.id}>
              <strong>{label(entry.type)}</strong>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString("en-NG")}
              </time>
              {entry.note && <p className="description">{entry.note}</p>}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

function BookingCard({
  item,
  busy,
  submit,
}: {
  item: Booking;
  busy: boolean;
  submit: Update;
}) {
  const available = actions[item.status] ?? [];
  const [action, setAction] = useState(available[0] ?? "");
  const changesSlot = action === "CONFIRMED" || action === "RESCHEDULED";
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!window.confirm(label(action) + " this appointment?")) return;
    const data = new FormData(event.currentTarget);
    const windowData =
      action === "RESCHEDULED"
        ? {
            startsAt: new Date(String(data.get("startsAt"))).toISOString(),
            endsAt: new Date(String(data.get("endsAt"))).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : undefined;
    void submit(item.id, {
      version: item.version,
      status: action,
      ...(changesSlot && { assigneeEmail: data.get("assigneeEmail") || null }),
      ...(windowData && { window: windowData }),
    });
  }
  return (
    <article className="surface panel stack">
      <div>
        <h2>{item.listing.title}</h2>
        <p>
          {item.reference} · {label(item.status)}
        </p>
      </div>
      <p>
        {item.customer.displayName && item.customer.displayName + " · "}
        {item.customer.email}
        {item.customer.phone && " · " + item.customer.phone}
      </p>
      <ClientContact
        email={item.customer.email}
        phone={item.customer.phone ?? null}
        reference={item.reference}
      />
      <p>
        {new Intl.DateTimeFormat("en-NG", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: item.timeZone,
        }).formatRange(new Date(item.startsAt), new Date(item.endsAt))}{" "}
        · {item.timeZone}
      </p>
      {item.assignee && <p>Assigned to {item.assignee.email}</p>}
      {item.notes && <p className="description">{item.notes}</p>}
      {available.length > 0 && (
        <form onSubmit={save} className="stack">
          <div className="form-grid">
            <label>
              Action
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                {available.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            {changesSlot && (
              <label>
                Assignee email
                <input
                  name="assigneeEmail"
                  type="email"
                  defaultValue={item.assignee?.email ?? ""}
                  required
                />
              </label>
            )}
            {action === "RESCHEDULED" && (
              <>
                <label>
                  Start (local time)
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={localDate(item.startsAt)}
                    required
                  />
                </label>
                <label>
                  End (local time)
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={localDate(item.endsAt)}
                    required
                  />
                </label>
              </>
            )}
          </div>
          <div>
            <button className="primary" disabled={busy}>
              Update appointment
            </button>
          </div>
        </form>
      )}
      <details>
        <summary>Appointment history</summary>
        <ul className="activity">
          {item.activity.map((entry) => (
            <li key={entry.id}>
              <strong>{label(entry.status)}</strong>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString("en-NG")}
              </time>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}

export function EngagementPanel({
  mode,
}: {
  mode: "enquiries" | "appointments";
}) {
  const [items, setItems] = useState<Array<Lead | Booking>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const endpoint = "/admin/" + mode;
  const load = useCallback(
    async (active = () => Boolean(true)) => {
      setError("");
      setLoading(true);
      try {
        const result = await api<Array<Lead | Booking>>(
          endpoint +
            "?" +
            new URLSearchParams({
              page: String(page),
              ...(status && { status }),
            }),
        );
        if (active()) setItems(result);
      } catch (error) {
        if (active()) setError(message(error));
      } finally {
        if (active()) setLoading(false);
      }
    },
    [endpoint, page, status],
  );
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);
  async function submit(id: string, body: object) {
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await api(endpoint + "/" + id, "PATCH", body);
      await load();
      setNotice(
        mode === "enquiries" ? "Enquiry updated." : "Appointment updated.",
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="heading">
        <h1>{label(mode)}</h1>
      </div>
      <div className="filters surface">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {(mode === "enquiries" ? leadStatuses : bookingStatuses).map(
              (value) => (
                <option key={value} value={value}>
                  {label(value)}
                </option>
              ),
            )}
          </select>
        </label>
        <button onClick={() => void load()} disabled={loading}>
          Reload
        </button>
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading ? (
        <p className="staff-loading" role="status">
          Loading {mode}…
        </p>
      ) : (
        <>
          {!items.length && (
            <p className="staff-empty">No {mode} match this filter.</p>
          )}
          {items.map((item) =>
            "message" in item ? (
              <LeadCard
                key={item.id + item.version}
                item={item}
                busy={busy}
                submit={submit}
              />
            ) : (
              <BookingCard
                key={item.id + item.version}
                item={item}
                busy={busy}
                submit={submit}
              />
            ),
          )}
          <div className="pager">
            <button
              disabled={page === 1 || busy}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={items.length < 25 || busy}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
