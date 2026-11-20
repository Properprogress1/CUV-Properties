"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, apiOrigin, label, message } from "./api";

const kinds = ["HOME", "BANNER", "FAQ", "ABOUT", "CONTACT", "BLOG", "LEGAL"];
const reserved: Record<string, string> = {
  HOME: "home",
  ABOUT: "about",
  CONTACT: "contact",
};
type Draft = {
  title: string;
  body: string;
  summary: string;
  linkLabel: string;
  linkHref: string;
  seoTitle: string;
  seoDescription: string;
};
type Entry = {
  slug: string;
  kind: string;
  version: number;
  draft: Draft;
  publishedAt: string | null;
};
type Save = (
  path: string,
  method: "POST" | "PATCH",
  data: object,
  success: string,
) => Promise<void>;

function Editor({
  entry,
  save,
  busy,
}: {
  entry?: Entry;
  save: Save;
  busy: boolean;
}) {
  const [kind, setKind] = useState(entry?.kind ?? "BLOG");
  const draft = entry?.draft;
  const path = entry ? "/admin/content/" + entry.slug : "/admin/content";
  const state = entry?.publishedAt ? "Published" : "Draft";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const draft = Object.fromEntries(
      [
        "title",
        "body",
        "summary",
        "linkLabel",
        "linkHref",
        "seoTitle",
        "seoDescription",
      ].map((name) => [name, data.get(name)]),
    );
    void save(
      path,
      entry ? "PATCH" : "POST",
      entry
        ? { draft, version: entry.version }
        : { draft, kind, slug: reserved[kind] ?? data.get("slug") },
      entry ? "Draft saved." : "Draft created.",
    );
  }
  function publication(action: "publish" | "unpublish") {
    if (entry && window.confirm(label(action) + " this content?"))
      void save(
        path + "/publication",
        "POST",
        { version: entry.version, action },
        action === "publish" ? "Content published." : "Content unpublished.",
      );
  }
  return (
    <article className="surface panel stack">
      {entry && (
        <div>
          <h2>{entry.draft.title}</h2>
          <p>
            {label(entry.kind)} · {entry.slug} ·{" "}
            <span className="badge">{state}</span>
          </p>
        </div>
      )}
      <form className="stack" onSubmit={submit}>
        {!entry && (
          <div className="form-grid">
            <label>
              Content type
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {kinds.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              URL slug
              <input
                name="slug"
                key={kind}
                defaultValue={reserved[kind] ?? ""}
                readOnly={Boolean(reserved[kind])}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={100}
                required
              />
            </label>
          </div>
        )}
        <label>
          Title
          <input
            name="title"
            defaultValue={draft?.title}
            required
            maxLength={160}
          />
        </label>
        <label>
          Body (plain text)
          <textarea
            name="body"
            defaultValue={draft?.body}
            required
            maxLength={24000}
            rows={5}
          />
        </label>
        <label>
          Summary
          <textarea
            name="summary"
            defaultValue={draft?.summary}
            rows={2}
            maxLength={300}
          />
        </label>
        <div className="form-grid">
          <label>
            Button label
            <input
              name="linkLabel"
              defaultValue={draft?.linkLabel}
              maxLength={70}
            />
          </label>
          <label>
            Button path
            <input
              name="linkHref"
              defaultValue={draft?.linkHref}
              placeholder="/browse"
              maxLength={300}
            />
          </label>
          <label>
            Search title
            <input
              name="seoTitle"
              defaultValue={draft?.seoTitle}
              maxLength={70}
            />
          </label>
          <label>
            Search description
            <input
              name="seoDescription"
              defaultValue={draft?.seoDescription}
              maxLength={160}
            />
          </label>
        </div>
        <div className="actions">
          <button className="primary" disabled={busy}>
            {entry ? "Save draft" : "Create draft"}
          </button>
          {entry && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => publication("publish")}
              >
                Publish saved draft
              </button>
              {entry.publishedAt && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => publication("unpublish")}
                >
                  Unpublish
                </button>
              )}
            </>
          )}
        </div>
      </form>
    </article>
  );
}

export function EditorialPanel() {
  const [entries, setEntries] = useState<Entry[]>();
  const [selected, setSelected] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      try {
        const query = new URLSearchParams({
          page: String(page),
          ...(type && { kind: type }),
        });
        const list = await api<Entry[]>("/admin/content?" + query);
        if (active()) setEntries(list);
      } catch (error) {
        if (active()) setFailure(message(error));
      }
    },
    [page, type],
  );
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);
  const save: Save = async (path, method, data, success) => {
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const row = await api<Entry>(path, method, data);
      setSelected(row.slug);
      if (type && row.kind !== type) {
        setType("");
        setPage(1);
      } else await load();
      setNotice(success);
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy(false);
    }
  };
  const current = entries?.find(({ slug }) => slug === selected);
  return (
    <div className="stack">
      <h1>Content</h1>
      <div className="surface filters">
        <label>
          Content type
          <select
            value={type}
            onChange={(event) => {
              setPage(1);
              setType(event.target.value);
              setSelected("");
            }}
          >
            <option value="">All types</option>
            {kinds.map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            setSelected("__new");
            setNotice("");
          }}
        >
          New content
        </button>
        <button onClick={() => void load()}>Reload</button>
      </div>
      {failure && (
        <p className="notice error" role="alert">
          {failure}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!entries && !failure && <p role="status">Loading content…</p>}
      {entries?.length === 0 && selected !== "__new" && (
        <p>No content added yet.</p>
      )}
      {entries && entries.length > 0 && (
        <div className="surface panel">
          <ul className="activity">
            {entries.map((row) => (
              <li key={row.slug}>
                <button
                  className="text-button"
                  onClick={() => setSelected(row.slug)}
                >
                  {row.draft.title}
                </button>
                <span>
                  {label(row.kind)} · {row.publishedAt ? "Published" : "Draft"}
                </span>
              </li>
            ))}
          </ul>
          <div className="pager">
            <button
              disabled={page === 1}
              onClick={() => {
                setPage(page - 1);
                setSelected("");
              }}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={entries.length < 25}
              onClick={() => {
                setPage(page + 1);
                setSelected("");
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
      {selected === "__new" && <Editor key="new" save={save} busy={busy} />}
      {current && (
        <Editor
          key={current.slug + ":" + current.version}
          entry={current}
          save={save}
          busy={busy}
        />
      )}
    </div>
  );
}

type StatusCount = { status: string; _count: { _all: number } };
type Report = {
  from: string;
  to: string;
  inventory: (StatusCount & { category: string })[];
  enquiries: StatusCount[];
  bookings: StatusCount[];
  orders: StatusCount[];
  services: StatusCount[];
  traffic: { category: string; event: string; _sum: { count: number } }[];
  payments: {
    currency: string;
    provider: string;
    _count: { _all: number };
    _sum: { amountMinor: string };
  }[];
  refunds: {
    currency: string;
    _count: { _all: number };
    _sum: { amountMinor: string };
  }[];
};
function Table({
  heading,
  headers,
  rows,
}: {
  heading: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  return (
    <section className="surface panel">
      <h2>{heading}</h2>
      {rows.length === 0 ? (
        <p>No records.</p>
      ) : (
        <div className="table-wrap">
          <table aria-label={heading}>
            <thead>
              <tr>
                {headers.map((name) => (
                  <th scope="col" key={name}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={JSON.stringify(row)}>
                  {row.map((value, index) => (
                    <td key={index}>{value}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ReportChart({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: [string, number][];
}) {
  const counts = new Map<string, number>();
  for (const [group, count] of rows) {
    counts.set(group, (counts.get(group) ?? 0) + count);
  }
  const max = Math.max(1, ...counts.values());
  return (
    <section className="surface staff-report-chart" aria-label={title}>
      <h2>{title}</h2>
      {counts.size ? (
        <ul>
          {Array.from(counts, ([group, count]) => (
            <li key={group}>
              <span>{label(group)}</span>
              <span className="staff-bar" aria-hidden="true">
                <span style={{ width: (count / max) * 100 + "%" }} />
              </span>
              <strong>{new Intl.NumberFormat("en-NG").format(count)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export function ReportsPanel({ permissions }: { permissions: string[] }) {
  const [report, setReport] = useState<Report>();
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(true);
  const [inventoryQuery, setInventoryQuery] = useState("");
  async function load(query = "") {
    setFailure("");
    setBusy(true);
    try {
      setReport(await api<Report>("/admin/reports" + query));
    } catch (error) {
      setFailure(message(error));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget))
      if (value) date.set(key, String(value));
    void load("?" + date);
  }
  const root = apiOrigin.replace(/\/$/, "") + "/api/v1/admin/reports/";
  return (
    <div className="stack">
      <h1>Reports</h1>
      <form className="surface filters" onSubmit={update}>
        <label>
          From (Lagos)
          <input
            type="date"
            name="from"
            key={report?.from}
            defaultValue={report?.from}
          />
        </label>
        <label>
          To (Lagos)
          <input
            type="date"
            name="to"
            key={report?.to}
            defaultValue={report?.to}
          />
        </label>
        <button disabled={busy}>Apply date range</button>
        {report && permissions.includes("analytics:export") && (
          <a
            className="text-button"
            href={
              root +
              "summary.csv?" +
              new URLSearchParams({ from: report.from, to: report.to })
            }
          >
            Download summary CSV
          </a>
        )}
      </form>
      {permissions.includes("analytics:export") &&
        permissions.includes("inventory:read") && (
          <form
            className="surface filters"
            onChange={(event) => {
              const query = new URLSearchParams();
              for (const [key, value] of new FormData(event.currentTarget))
                if (value) query.set(key, String(value));
              setInventoryQuery(query.toString());
            }}
          >
            <label>
              Inventory category
              <select name="category">
                <option value="">All categories</option>
                {["PROPERTY", "LAND", "VEHICLE", "SERVICE"].map((state) => (
                  <option key={state} value={state}>
                    {label(state)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Inventory status
              <select name="status">
                <option value="">All statuses</option>
                {[
                  "DRAFT",
                  "PUBLISHED",
                  "UNPUBLISHED",
                  "RESERVED",
                  "SOLD",
                  "RENTED",
                  "COMPLETED",
                  "ARCHIVED",
                  "EXPIRED",
                ].map((state) => (
                  <option key={state} value={state}>
                    {label(state)}
                  </option>
                ))}
              </select>
            </label>
            <a
              className="text-button"
              href={root + "inventory.csv?" + inventoryQuery}
            >
              Download inventory CSV
            </a>
          </form>
        )}
      {failure && (
        <p className="notice error" role="alert">
          {failure}
        </p>
      )}
      {busy && <p role="status">Loading report…</p>}
      {report && (
        <>
          <div className="staff-report-charts">
            <ReportChart
              title="Inventory by category"
              empty="No inventory to report."
              rows={report.inventory.map((row) => [
                row.category,
                row._count._all,
              ])}
            />
            <ReportChart
              title="Catalog events"
              empty="No catalog events in this date range."
              rows={report.traffic.map((row) => [row.event, row._sum.count])}
            />
          </div>
          <Table
            heading="Inventory now"
            headers={["Category", "Status", "Count"]}
            rows={report.inventory.map((row) => [
              label(row.category),
              label(row.status),
              row._count._all,
            ])}
          />
          <Table
            heading="Catalog activity"
            headers={["Category", "Event", "Count"]}
            rows={report.traffic.map((row) => [
              label(row.category),
              label(row.event),
              row._sum.count,
            ])}
          />
          {(["enquiries", "bookings", "orders", "services"] as const).map(
            (section) => (
              <Table
                heading={label(section)}
                key={section}
                headers={["Status", "Count"]}
                rows={report[section].map((row) => [
                  label(row.status),
                  row._count._all,
                ])}
              />
            ),
          )}
          <Table
            heading="Confirmed payments"
            headers={["Provider", "Currency", "Count", "Minor units"]}
            rows={report.payments.map((row) => [
              row.provider,
              row.currency,
              row._count._all,
              row._sum.amountMinor,
            ])}
          />
          <Table
            heading="Processed refunds"
            headers={["Currency", "Count", "Minor units"]}
            rows={report.refunds.map((row) => [
              row.currency,
              row._count._all,
              row._sum.amountMinor,
            ])}
          />
        </>
      )}
    </div>
  );
}
