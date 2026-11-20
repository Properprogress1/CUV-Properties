"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, label, message } from "./api";

type Quote = {
  reference: string;
  revision: number;
  status: string;
  currency: string;
  totalMinor: string;
  validUntil: string;
  order: { reference: string; status: string } | null;
};
type Milestone = {
  id: string;
  title: string;
  dueAt: string;
  status: string;
  evidence: string | null;
};
type Request = {
  reference: string;
  version: number;
  status: string;
  scope: string;
  location: string;
  timeline: string | null;
  currency: string;
  budgetMinor: string | null;
  listing: { title: string };
  customer: { email: string };
  assignee: { email: string } | null;
  updates: { id: string; author: string; message: string }[];
  quotes: Quote[];
  project: { milestones: Milestone[] } | null;
};
type Mutate = (
  path: string,
  method: "POST" | "PATCH",
  body: object,
  success: string,
) => Promise<void>;
const states = [
  "NEW",
  "REVIEWING",
  "NEEDS_INFORMATION",
  "QUOTED",
  "ACCEPTED",
  "CLOSED",
];

function dateInput(value: string) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
const dateValue = (value: FormDataEntryValue | null) =>
  new Date(String(value)).toISOString();

function QuotationForm({
  row,
  path,
  busy,
  mutate,
}: {
  row: Request;
  path: string;
  busy: boolean;
  mutate: Mutate;
}) {
  const [lines, setLines] = useState([0]);
  const [nextLine, setNextLine] = useState(1);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void mutate(
      path + "/quotes",
      "POST",
      {
        version: row.version,
        currency: data.get("currency"),
        terms: data.get("terms"),
        timeline: data.get("timeline"),
        validUntil: dateValue(data.get("validUntil")),
        lines: lines.map((id) => ({
          title: data.get("title-" + id),
          quantity: Number(data.get("quantity-" + id)),
          unitAmountMinor: data.get("amount-" + id),
        })),
      },
      "Quotation sent.",
    );
  }
  return (
    <details>
      <summary>Send a quotation</summary>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <label>
            Currency
            <input
              name="currency"
              defaultValue={row.currency}
              pattern="[A-Z]{3}"
              required
            />
          </label>
          <label>
            Valid until (local time)
            <input type="datetime-local" name="validUntil" required />
          </label>
          <label>
            Expected timeline
            <input name="timeline" minLength={2} maxLength={250} required />
          </label>
        </div>
        <label>
          Terms
          <textarea name="terms" minLength={5} maxLength={5000} required />
        </label>
        {lines.map((id, index) => (
          <fieldset key={id} className="form-grid">
            <legend>Line {index + 1}</legend>
            <label>
              Deliverable
              <input
                name={"title-" + id}
                minLength={2}
                maxLength={160}
                required
              />
            </label>
            <label>
              Quantity
              <input
                name={"quantity-" + id}
                type="number"
                min={1}
                max={1000}
                defaultValue={1}
                required
              />
            </label>
            <label>
              Unit amount in minor units
              <input
                name={"amount-" + id}
                inputMode="numeric"
                pattern="[1-9][0-9]{0,14}"
                required
              />
            </label>
            {lines.length > 1 && (
              <button
                type="button"
                onClick={() => setLines(lines.filter((line) => line !== id))}
              >
                Remove line {index + 1}
              </button>
            )}
          </fieldset>
        ))}
        <div className="actions">
          <button
            type="button"
            disabled={lines.length >= 20}
            onClick={() => {
              setLines([...lines, nextLine]);
              setNextLine(nextLine + 1);
            }}
          >
            Add line
          </button>
          <button className="primary" disabled={busy}>
            Send quotation
          </button>
        </div>
      </form>
    </details>
  );
}

function MilestoneForm({
  item,
  version,
  path,
  busy,
  mutate,
}: {
  item?: Milestone;
  version: number;
  path: string;
  busy: boolean;
  mutate: Mutate;
}) {
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void mutate(
          path + "/milestones" + (item ? "/" + item.id : ""),
          item ? "PATCH" : "POST",
          {
            version,
            title: data.get("title"),
            dueAt: dateValue(data.get("dueAt")),
            status: data.get("status"),
            evidence: data.get("evidence") || null,
          },
          item ? "Milestone updated." : "Milestone added.",
        );
      }}
    >
      <div className="form-grid">
        <label>
          Milestone title
          <input
            name="title"
            defaultValue={item?.title}
            required
            minLength={2}
            maxLength={160}
          />
        </label>
        <label>
          Due (local time)
          <input
            name="dueAt"
            type="datetime-local"
            defaultValue={item ? dateInput(item.dueAt) : ""}
            required
          />
        </label>
        <label>
          Milestone status
          <select name="status" defaultValue={item?.status ?? "PLANNED"}>
            {["PLANNED", "IN_PROGRESS", "COMPLETED"].map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Completion evidence
        <textarea
          name="evidence"
          defaultValue={item?.evidence ?? ""}
          maxLength={2000}
        />
      </label>
      <div>
        <button className="primary" disabled={busy}>
          {item ? "Save milestone" : "Add milestone"}
        </button>
      </div>
    </form>
  );
}

function ServiceCard({
  row,
  busy,
  mutate,
}: {
  row: Request;
  busy: boolean;
  mutate: Mutate;
}) {
  const path = "/admin/services/" + row.reference;
  return (
    <article className="surface panel stack">
      <div>
        <h2>{row.listing.title}</h2>
        <p>
          {row.reference} · {label(row.status)} · {row.customer.email}
        </p>
      </div>
      <p className="description">{row.scope}</p>
      <p>
        {row.location}
        {row.timeline && " · " + row.timeline}
        {row.budgetMinor &&
          " · " + row.currency + " " + row.budgetMinor + " minor units"}
      </p>
      {row.status !== "CLOSED" && (
        <details>
          <summary>Assign or update request</summary>
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void mutate(
                path,
                "PATCH",
                {
                  version: row.version,
                  status: data.get("status"),
                  assigneeEmail: data.get("assigneeEmail") || null,
                  message: data.get("message"),
                },
                "Request updated.",
              );
            }}
          >
            <div className="form-grid">
              <label>
                Status
                <select
                  name="status"
                  defaultValue={
                    row.status === "NEEDS_INFORMATION"
                      ? row.status
                      : "REVIEWING"
                  }
                >
                  {(row.status === "ACCEPTED"
                    ? ["REVIEWING"]
                    : ["REVIEWING", "NEEDS_INFORMATION", "CLOSED"]
                  ).map((status) => (
                    <option key={status} value={status}>
                      {row.status === "ACCEPTED"
                        ? "Keep accepted"
                        : label(status)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee email
                <input
                  name="assigneeEmail"
                  defaultValue={row.assignee?.email ?? ""}
                  type="email"
                />
              </label>
            </div>
            <label>
              Message visible to the customer
              <textarea name="message" maxLength={2500} />
            </label>
            <div>
              <button className="primary" disabled={busy}>
                Save request update
              </button>
            </div>
          </form>
        </details>
      )}
      {row.status !== "CLOSED" && row.status !== "ACCEPTED" && (
        <QuotationForm row={row} path={path} busy={busy} mutate={mutate} />
      )}
      {!!row.quotes.length && (
        <details>
          <summary>Quotation history</summary>
          <ul className="activity">
            {row.quotes.map((quote) => (
              <li key={quote.reference}>
                <strong>
                  {quote.reference} · Revision {quote.revision}
                </strong>
                <span>
                  {label(quote.status)} · {quote.currency} {quote.totalMinor}{" "}
                  minor units
                </span>
                <span>
                  Valid until{" "}
                  {new Date(quote.validUntil).toLocaleString("en-NG")}
                </span>
                {quote.order && (
                  <span>
                    {quote.order.reference} · {label(quote.order.status)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!row.updates.length && (
        <details>
          <summary>Messages and updates</summary>
          <ul className="activity">
            {row.updates.map((update) => (
              <li key={update.id}>
                <strong>{label(update.author)}</strong>
                <p className="description">{update.message}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {row.project && (
        <details>
          <summary>Manage project milestones</summary>
          {row.project.milestones.map((item) => (
            <section key={item.id} className="panel">
              <h3>
                {item.title} · {label(item.status)}
              </h3>
              <MilestoneForm
                item={item}
                version={row.version}
                path={path}
                busy={busy}
                mutate={mutate}
              />
            </section>
          ))}
          <MilestoneForm
            version={row.version}
            path={path}
            busy={busy}
            mutate={mutate}
          />
        </details>
      )}
    </article>
  );
}

export function ServicesPanel() {
  const [rows, setRows] = useState<Request[]>();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      setLoading(true);
      setError("");
      try {
        const query = new URLSearchParams({
          page: String(page),
          ...(status && { status }),
        });
        const items = await api<Request[]>("/admin/services?" + query);
        if (active()) setRows(items);
      } catch (error) {
        if (active()) setError(message(error));
      } finally {
        if (active()) setLoading(false);
      }
    },
    [page, status],
  );
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);
  const mutate: Mutate = async (path, method, body, success) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(path, method, body);
      await load();
      setNotice(success);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <h1>Professional services</h1>
      <div className="surface filters">
        <label>
          Status
          <select
            value={status}
            onChange={(event) => {
              setPage(1);
              setStatus(event.target.value);
            }}
          >
            <option value="">All requests</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {label(state)}
              </option>
            ))}
          </select>
        </label>
        <button disabled={loading} onClick={() => void load()}>
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
        <p role="status">Loading service requests…</p>
      ) : (
        <>
          {rows?.length === 0 && <p>No service requests match this filter.</p>}
          {rows?.map((row) => (
            <ServiceCard
              row={row}
              key={row.reference + row.version}
              busy={busy}
              mutate={mutate}
            />
          ))}
          <div className="pager">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={(rows?.length ?? 0) < 25}
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
