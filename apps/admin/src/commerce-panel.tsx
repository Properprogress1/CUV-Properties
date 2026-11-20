"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, label, message } from "./api";

type Payment = {
  reference: string;
  providerReference: string;
  status: string;
  amountMinor: string;
  currency: string;
  createdAt: string;
  order: { reference: string; status: string; customer: { email: string } };
};
type Refund = {
  reference: string;
  status: string;
  currency: string;
  amountMinor: string;
  reason: string;
  payment: { reference: string; order: { reference: string } };
};
type Exception = {
  id: string;
  reference: string;
  outcome: string;
  reason: string;
  createdAt: string;
};
type Audit = {
  id: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

function PaymentCard({
  item,
  mutation,
  refunds,
}: {
  item: Payment;
  refunds: boolean;
  mutation: (
    request: () => Promise<unknown>,
    feedback: string,
  ) => Promise<boolean>;
}) {
  const [audit, setAudit] = useState<Audit[]>();
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef("");
  const route = "/admin/commerce/payments/" + item.reference;
  async function history() {
    setFeedback("");
    try {
      setAudit(
        await api<Audit[]>(
          "/admin/commerce/orders/" + item.order.reference + "/audit",
        ),
      );
    } catch (failure) {
      setFeedback(message(failure));
    }
  }
  async function reconcile() {
    setBusy(true);
    setFeedback("");
    try {
      const result = await api<{
        status: string;
        providerResult: string | null;
        disposition: string | null;
      }>(route + "/reconcile", "POST");
      setFeedback(
        `Current state: ${label(result.status)}. Provider result: ${result.providerResult ? label(result.providerResult) : "none"}.${result.disposition ? " " + label(result.disposition) + "." : ""}`,
      );
    } catch (failure) {
      setFeedback(message(failure));
    } finally {
      setBusy(false);
    }
  }
  function requestRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries(new FormData(form));
    key.current ||= crypto.randomUUID();
    void mutation(
      () => api(route + "/refunds", "POST", { ...input, key: key.current }),
      "Refund requested.",
    ).then((success) => {
      if (success) {
        key.current = "";
        form.reset();
      }
    });
  }
  return (
    <article className="surface panel stack">
      <h2>
        {item.reference} <span className="badge">{label(item.status)}</span>
      </h2>
      <p>
        {item.order.reference} · {item.order.customer.email} · {item.currency}{" "}
        {item.amountMinor} minor units
      </p>
      <p>
        Provider {item.providerReference} · Created{" "}
        {new Date(item.createdAt).toLocaleString("en-NG")}
      </p>
      <div className="actions">
        <button disabled={busy} onClick={() => void reconcile()}>
          Verify with sandbox
        </button>
        <button onClick={() => void history()}>View audit history</button>
      </div>
      {feedback && <p role="status">{feedback}</p>}
      {audit && (
        <ul className="activity">
          {audit.map((entry) => (
            <li key={entry.id}>
              <strong>{label(entry.action)}</strong>
              <time dateTime={entry.createdAt}>
                {new Date(entry.createdAt).toLocaleString("en-NG")}
              </time>
            </li>
          ))}
        </ul>
      )}
      {item.status === "SUCCEEDED" && refunds && (
        <details>
          <summary>Request sandbox refund</summary>
          <form className="stack" onSubmit={requestRefund}>
            <label>
              Amount in {item.currency} minor units
              <input
                name="amountMinor"
                inputMode="numeric"
                pattern="[1-9][0-9]{0,14}"
                required
              />
            </label>
            <label>
              Reason
              <textarea name="reason" minLength={8} maxLength={1000} required />
            </label>
            <div>
              <button className="primary">Request refund</button>
            </div>
          </form>
        </details>
      )}
    </article>
  );
}

function RefundCard({
  item,
  approve,
  process,
  mutation,
}: {
  item: Refund;
  approve: boolean;
  process: boolean;
  mutation: (
    request: () => Promise<unknown>,
    feedback: string,
  ) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  async function change(action: string, sandboxOutcome?: string) {
    if (!window.confirm(label(action) + " this sandbox refund?")) return;
    setBusy(true);
    try {
      await mutation(
        () =>
          api(
            "/admin/commerce/refunds/" + item.reference + "/actions",
            "POST",
            { action, ...(sandboxOutcome && { sandboxOutcome }) },
          ),
        "Refund updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="surface panel stack">
      <h2>
        {item.reference} <span className="badge">{label(item.status)}</span>
      </h2>
      <p>
        {item.payment.order.reference} · {item.payment.reference} ·{" "}
        {item.currency} {item.amountMinor} minor units
      </p>
      <p className="description">{item.reason}</p>
      <div className="actions">
        {item.status === "REQUESTED" && approve && (
          <button disabled={busy} onClick={() => void change("approve")}>
            Approve refund
          </button>
        )}
        {["REQUESTED", "APPROVED"].includes(item.status) && approve && (
          <button disabled={busy} onClick={() => void change("reject")}>
            Reject refund
          </button>
        )}
        {item.status === "APPROVED" && process && (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void change("process", "SUCCEEDED")}
            >
              Process sandbox refund
            </button>
            <button
              disabled={busy}
              onClick={() => void change("process", "FAILED")}
            >
              Simulate refund failure
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function CommercePanel({ permissions }: { permissions: string[] }) {
  const canReadPayments = permissions.includes("commerce:reconcile");
  const canReadRefunds = permissions.includes("commerce:refund");
  const [tab, setTab] = useState<"payments" | "refunds">(
    canReadPayments ? "payments" : "refunds",
  );
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [payments, setPayments] = useState<{
    payments: Payment[];
    exceptions: Exception[];
  }>();
  const [refunds, setRefunds] = useState<Refund[]>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      setFailure("");
      setLoading(true);
      const query = new URLSearchParams({
        page: String(page),
        ...(filter && { status: filter }),
      });
      try {
        if (tab === "payments") {
          const data = await api<{
            payments: Payment[];
            exceptions: Exception[];
          }>("/admin/commerce/payments?" + query);
          if (active()) setPayments(data);
        } else {
          const data = await api<Refund[]>("/admin/commerce/refunds?" + query);
          if (active()) setRefunds(data);
        }
      } catch (error) {
        if (active()) setFailure(message(error));
      } finally {
        if (active()) setLoading(false);
      }
    },
    [tab, filter, page],
  );
  useEffect(() => {
    let active = true;
    void load(() => active);
    return () => {
      active = false;
    };
  }, [load]);
  async function mutation(request: () => Promise<unknown>, feedback: string) {
    if (busy) return false;
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await request();
      await load();
      setNotice(feedback);
      return true;
    } catch (error) {
      setFailure(message(error));
      return false;
    } finally {
      setBusy(false);
    }
  }
  function changeTab(value: typeof tab) {
    setTab(value);
    setPage(1);
    setFilter("");
    setNotice("");
  }
  const options =
    tab === "payments"
      ? ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "TIMED_OUT"]
      : ["REQUESTED", "APPROVED", "REJECTED", "SUCCEEDED", "FAILED"];
  const count =
    tab === "payments"
      ? (payments?.payments.length ?? 0)
      : (refunds?.length ?? 0);
  return (
    <div className="stack">
      <h1>Commerce</h1>
      <p>Sandbox transactions. No funds are moved.</p>
      <nav className="actions workspace-nav" aria-label="Commerce tools">
        {canReadPayments && (
          <button
            aria-pressed={tab === "payments"}
            onClick={() => changeTab("payments")}
          >
            Payment reconciliation
          </button>
        )}
        {canReadRefunds && (
          <button
            aria-pressed={tab === "refunds"}
            onClick={() => changeTab("refunds")}
          >
            Refunds
          </button>
        )}
      </nav>
      <div className="filters surface">
        <label>
          Status
          <select
            value={filter}
            onChange={(event) => {
              setPage(1);
              setFilter(event.target.value);
            }}
          >
            <option value="">All statuses</option>
            {options.map((state) => (
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
      {failure && (
        <p role="alert" className="notice error">
          {failure}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Loading {tab}…</p>
      ) : (
        <>
          {count === 0 && <p>No {tab} match this filter.</p>}
          {tab === "payments" ? (
            <>
              {payments?.payments.map((item) => (
                <PaymentCard
                  key={item.reference}
                  item={item}
                  mutation={mutation}
                  refunds={canReadRefunds}
                />
              ))}
              <section className="surface panel">
                <h2>Verification exceptions</h2>
                {payments?.exceptions.length ? (
                  <ul className="activity">
                    {payments.exceptions.map((item) => (
                      <li key={item.id}>
                        {item.reference} · {item.reason} · {label(item.outcome)}{" "}
                        · {new Date(item.createdAt).toLocaleString("en-NG")}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No verification exceptions.</p>
                )}
              </section>
            </>
          ) : (
            refunds?.map((item) => (
              <RefundCard
                key={item.reference}
                item={item}
                approve={permissions.includes("commerce:refund-approve")}
                process={permissions.includes("commerce:refund-process")}
                mutation={mutation}
              />
            ))
          )}
          <div className="pager">
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>Page {page}</span>
            <button disabled={count < 25} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
