"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  authNeeded,
  customerApi,
  errorText,
  fields,
  stateLabel,
} from "./customer-api";

type Quote = {
  reference: string;
  status: string;
  revision: number;
  currency: string;
  totalMinor: string;
  terms: string;
  timeline: string;
  validUntil: string;
  lines: {
    id: string;
    title: string;
    quantity: number;
    unitAmountMinor: string;
  }[];
  order: {
    reference: string;
    status: string;
    payments: { reference: string }[];
  } | null;
};
type Request = {
  reference: string;
  status: string;
  scope: string;
  location: string;
  sandboxEnabled: boolean;
  listing: { title: string };
  updates: { id: string; author: string; message: string }[];
  quotes: Quote[];
  project: {
    milestones: {
      id: string;
      title: string;
      status: string;
      dueAt: string;
      evidence: string | null;
    }[];
  } | null;
};

export function ServiceRequestForm({ slug }: { slug: string }) {
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = fields(form);
    setBusy(true);
    setFailure("");
    setMessage("");
    setLogin(false);
    try {
      const result = await customerApi<{ reference: string }>(
        "/account/services",
        "POST",
        {
          slug,
          scope: data.scope,
          location: data.location,
          timeline: data.timeline || null,
          budgetMinor: data.budgetMinor || null,
          currency: data.currency,
        },
      );
      form.reset();
      setMessage("Service request received. Reference " + result.reference);
    } catch (error) {
      if (authNeeded(error)) setLogin(true);
      else setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-panel sandbox-offer" id="service-request">
      <h2>Request a quotation</h2>
      <form className="engagement-form" onSubmit={submit}>
        <label>
          Scope of work
          <textarea name="scope" minLength={20} maxLength={5000} required />
        </label>
        <label>
          Project location
          <input name="location" minLength={2} maxLength={200} required />
        </label>
        <label>
          Preferred timeline
          <input name="timeline" maxLength={250} />
        </label>
        <label>
          Budget in minor units (optional)
          <input
            name="budgetMinor"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,14}"
          />
        </label>
        <label>
          Budget currency
          <input
            name="currency"
            defaultValue="NGN"
            pattern="[A-Z]{3}"
            required
          />
        </label>
        <button className="button button-dark" disabled={busy}>
          Send service request
        </button>
      </form>
      {message && (
        <p role="status">
          {message}{" "}
          <Link className="text-link" href="/account">
            Track this request
          </Link>
        </p>
      )}
      {failure && <p role="alert">{failure}</p>}
      {login && (
        <p>
          <Link className="text-link" href="/account">
            Sign in
          </Link>{" "}
          to request a quotation.
        </p>
      )}
    </section>
  );
}

export function ServiceRequests() {
  const [items, setItems] = useState<Request[]>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const keys = useRef<Record<string, string>>({});
  const router = useRouter();
  async function load() {
    try {
      setItems(await customerApi<Request[]>("/account/services"));
    } catch (failure) {
      setError(errorText(failure));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function run(request: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request();
      await load();
      if (success) setNotice(success);
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }
  function startPayment(orderReference: string) {
    keys.current[orderReference] ||= crypto.randomUUID();
    return run(async () => {
      const result = await customerApi<{ paymentReference: string }>(
        "/commerce/orders/" + orderReference + "/payments",
        "POST",
        { key: keys.current[orderReference] },
      );
      router.push("/checkout/" + result.paymentReference);
    }, "");
  }
  return (
    <section className="account-panel">
      <h2>Service requests and projects</h2>
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => void load()}>
            Reload
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!items && !error && <p role="status">Loading service requests…</p>}
      {items?.length === 0 && <p>No service requests yet.</p>}
      <ul>
        {items?.map((item) => (
          <li key={item.reference}>
            <strong>{item.listing.title}</strong>
            <p>
              {item.reference} · {stateLabel(item.status)}
            </p>
            <details>
              <summary>Request details and messages</summary>
              <p className="description">{item.scope}</p>
              <p>{item.location}</p>
              <ul>
                {item.updates.map((update) => (
                  <li key={update.id}>
                    <strong>{stateLabel(update.author)}</strong>
                    <p className="description">{update.message}</p>
                  </li>
                ))}
              </ul>
              {item.status !== "CLOSED" && (
                <form
                  className="engagement-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const { message } = fields(form);
                    void run(async () => {
                      await customerApi(
                        "/account/services/" + item.reference + "/replies",
                        "POST",
                        { message },
                      );
                      form.reset();
                    }, "Reply sent.");
                  }}
                >
                  <label>
                    Reply
                    <textarea
                      name="message"
                      minLength={5}
                      maxLength={2500}
                      required
                    />
                  </label>
                  <button className="button button-light" disabled={busy}>
                    Send reply
                  </button>
                </form>
              )}
            </details>
            <ul>
              {item.quotes.map((quote) => {
                const active =
                  quote.status === "SENT" &&
                  new Date(quote.validUntil).getTime() > Date.now();
                return (
                  <li key={quote.reference}>
                    <p>
                      <strong>Quotation {quote.revision}</strong> ·{" "}
                      {quote.status === "SENT" && !active
                        ? "expired"
                        : stateLabel(quote.status)}
                    </p>
                    <p>
                      {quote.currency} {quote.totalMinor} minor units · Valid
                      until {new Date(quote.validUntil).toLocaleString("en-NG")}
                    </p>
                    <ul>
                      {quote.lines.map((line) => (
                        <li key={line.id}>
                          {line.title} · {line.quantity} ×{" "}
                          {line.unitAmountMinor} minor units
                        </li>
                      ))}
                    </ul>
                    <p>{quote.timeline}</p>
                    <p className="description">{quote.terms}</p>
                    {active && (
                      <div className="filter-actions">
                        {(["accept", "reject"] as const).map((action) => (
                          <button
                            key={action}
                            className="button button-light"
                            disabled={busy}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  action === "accept"
                                    ? "Accept this quotation and create an order?"
                                    : "Decline this quotation?",
                                )
                              )
                                return;
                              void run(
                                () =>
                                  customerApi(
                                    "/account/services/" +
                                      item.reference +
                                      "/quotes/" +
                                      quote.reference +
                                      "/decision",
                                    "POST",
                                    { action },
                                  ),
                                action === "accept"
                                  ? "Quotation accepted."
                                  : "Quotation declined.",
                              );
                            }}
                          >
                            {action === "accept"
                              ? "Accept quotation"
                              : "Decline quotation"}
                          </button>
                        ))}
                      </div>
                    )}
                    {quote.order && (
                      <p>
                        {quote.order.reference} ·{" "}
                        {stateLabel(quote.order.status)}
                      </p>
                    )}
                    {item.sandboxEnabled &&
                      quote.order?.status === "AWAITING_PAYMENT" &&
                      (quote.order.payments[0] ? (
                        <Link
                          className="button button-light"
                          href={
                            "/checkout/" + quote.order.payments[0].reference
                          }
                        >
                          Resume sandbox payment
                        </Link>
                      ) : (
                        <button
                          className="button button-dark"
                          disabled={busy}
                          onClick={() =>
                            void startPayment(quote.order!.reference)
                          }
                        >
                          Start sandbox payment
                        </button>
                      ))}
                  </li>
                );
              })}
            </ul>
            {item.project && (
              <details>
                <summary>Project milestones</summary>
                {item.project.milestones.length === 0 && (
                  <p>No milestones yet.</p>
                )}
                <ul>
                  {item.project.milestones.map((entry) => (
                    <li key={entry.id}>
                      <strong>{entry.title}</strong>
                      <p>
                        {stateLabel(entry.status)} ·{" "}
                        {new Date(entry.dueAt).toLocaleDateString("en-NG")}
                      </p>
                      {entry.evidence && (
                        <p className="description">{entry.evidence}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
