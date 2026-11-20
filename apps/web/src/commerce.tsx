"use client";

import Link from "next/link";
import { CreditCard, Download } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  authNeeded,
  customerApi,
  errorText,
  fields,
  stateLabel,
} from "./customer-api";

const apiOrigin = (
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001"
).replace(/\/$/, "");

type Amount = { amountMinor: string; currency: string };
type Attempt = Amount & {
  reference: string;
  status: string;
  receipt: { reference: string } | null;
  refunds: Array<Amount & { reference: string; status: string }>;
};
type Order = Amount & {
  reference: string;
  status: string;
  createdAt: string;
  sandboxEnabled: boolean;
  items: { title: string }[];
  payments: Attempt[];
};
type Payment = Omit<Attempt, "refunds"> & {
  expiresAt: string;
  sandboxEnabled: boolean;
  order: { reference: string; status: string; items: { title: string }[] };
};
type CheckoutResponse = { paymentReference: string };

function displayMoney(amount: Amount) {
  const format = new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: amount.currency,
  });
  return format.format(
    Number(amount.amountMinor) /
      10 ** (format.resolvedOptions().maximumFractionDigits ?? 2),
  );
}

function receiptLink(id: string) {
  return (
    apiOrigin + "/api/v1/commerce/receipts/" + encodeURIComponent(id) + ".pdf"
  );
}

export function CheckoutOffer({ slug }: { slug: string }) {
  const [offer, setOffer] = useState<(Amount & { available: true }) | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const key = useRef("");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void customerApi<{ available: false } | (Amount & { available: true })>(
      "/commerce/offers/" + slug,
    )
      .then((item) => {
        if (item.available && active) setOffer(item);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [slug]);

  async function start() {
    setBusy(true);
    setMessage("");
    setLogin(false);
    key.current ||= crypto.randomUUID();
    try {
      const item = await customerApi<CheckoutResponse>(
        "/commerce/checkout",
        "POST",
        { slug, key: key.current },
      );
      router.push("/checkout/" + item.paymentReference);
    } catch (error) {
      if (authNeeded(error)) setLogin(true);
      else setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  if (!offer) return null;
  return (
    <section className="account-panel sandbox-offer">
      <h2>Sandbox checkout</h2>
      <p>Test payment of {displayMoney(offer)}. No funds will be charged.</p>
      <button
        className="button button-dark"
        disabled={busy}
        onClick={() => void start()}
      >
        Start sandbox checkout
      </button>
      {message && <p role="alert">{message}</p>}
      {login && (
        <p>
          <Link className="text-link" href="/account">
            Sign in
          </Link>{" "}
          to start checkout.
        </p>
      )}
    </section>
  );
}

export function SandboxPayment({ reference }: { reference: string }) {
  const [payment, setPayment] = useState<Payment>();
  const [message, setMessage] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const retryKey = useRef("");
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void customerApi<Payment>("/commerce/payments/" + reference)
      .then((item) => {
        if (active) setPayment(item);
      })
      .catch((error) => {
        if (active) {
          setLogin(authNeeded(error));
          setMessage(errorText(error));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reference]);

  async function simulate(outcome: string) {
    setBusy(true);
    setMessage("");
    try {
      setPayment(
        await customerApi<Payment>(
          "/commerce/sandbox/" + reference + "/outcome",
          "POST",
          { outcome },
        ),
      );
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function retry(orderReference: string) {
    setBusy(true);
    setMessage("");
    retryKey.current ||= crypto.randomUUID();
    try {
      const item = await customerApi<CheckoutResponse>(
        "/commerce/orders/" + orderReference + "/payments",
        "POST",
        { key: retryKey.current },
      );
      router.push("/checkout/" + item.paymentReference);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const outcomes = {
    PENDING: "Simulate pending",
    SUCCEEDED: "Simulate success",
    FAILED: "Simulate failure",
    CANCELLED: "Simulate cancellation",
    TIMED_OUT: "Simulate timeout",
  };
  return (
    <div className="wrap account-page cuv-document cuv-checkout">
      <header className="cuv-document-head">
        <CreditCard size={27} aria-hidden="true" />
        <h1>Sandbox payment</h1>
        <p>Test checkout. No funds are charged.</p>
      </header>
      <div className="cuv-checkout-content">
        {loading && (
          <div className="cuv-skeleton cuv-payment-loading" role="status">
            <span className="sr-only">Checking payment…</span>
          </div>
        )}
        {message && (
          <p className="state" role="alert">
            {message}
          </p>
        )}
        {login && (
          <Link className="button button-dark" href="/account">
            Sign in
          </Link>
        )}
        {payment && (
          <section className="account-panel cuv-order-summary">
            <h2>{payment.order.items[0]?.title ?? "Service"}</h2>
            <dl className="cuv-order-total">
              <div>
                <dt>Order reference</dt>
                <dd>{payment.order.reference}</dd>
              </div>
              <div>
                <dt>Total</dt>
                <dd>{displayMoney(payment)}</dd>
              </div>
            </dl>
            <p className="state" role="status">
              Payment {stateLabel(payment.status)}.
            </p>
            {payment.sandboxEnabled && payment.status === "PENDING" && (
              <div className="filter-actions">
                {Object.entries(outcomes).map(([outcome, label]) => (
                  <button
                    key={outcome}
                    type="button"
                    className="button button-light"
                    disabled={busy}
                    onClick={() => void simulate(outcome)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {payment.sandboxEnabled &&
              payment.status !== "PENDING" &&
              payment.status !== "SUCCEEDED" &&
              payment.order.status === "AWAITING_PAYMENT" && (
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => void retry(payment.order.reference)}
                >
                  Start a new attempt
                </button>
              )}
            {payment.receipt && (
              <p>
                <a
                  className="button button-dark"
                  href={receiptLink(payment.receipt.reference)}
                >
                  <Download size={17} aria-hidden="true" /> Download sandbox
                  receipt (PDF)
                </a>
              </p>
            )}
            <Link className="text-link" href="/account">
              View account history
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function RefundForm({
  payment,
  changed,
}: {
  payment: Attempt;
  changed: () => Promise<void>;
}) {
  const key = useRef("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const { amountMinor, reason } = fields(form);
    key.current ||= crypto.randomUUID();
    setBusy(true);
    setError("");
    setFeedback("");
    void customerApi(
      "/commerce/payments/" + payment.reference + "/refunds",
      "POST",
      { key: key.current, amountMinor, reason },
    )
      .then(async () => {
        key.current = "";
        form.reset();
        setFeedback("Refund requested.");
        await changed();
      })
      .catch((error) => setError(errorText(error)))
      .finally(() => setBusy(false));
  }
  return (
    <details>
      <summary>Request a sandbox refund</summary>
      <form className="engagement-form" onSubmit={request}>
        <label>
          Amount in {payment.currency} minor units
          <input
            name="amountMinor"
            inputMode="numeric"
            pattern="[1-9][0-9]{0,14}"
            defaultValue={payment.amountMinor}
            required
          />
        </label>
        <label>
          Reason
          <textarea name="reason" minLength={8} maxLength={1000} required />
        </label>
        <button className="button button-light" disabled={busy}>
          Submit refund request
        </button>
        {error && <p role="alert">{error}</p>}
        {feedback && <p role="status">{feedback}</p>}
      </form>
    </details>
  );
}

export function CommerceHistory() {
  const [orders, setOrders] = useState<Order[]>();
  const [error, setError] = useState("");
  async function load() {
    try {
      setOrders(await customerApi<Order[]>("/commerce/orders"));
      setError("");
    } catch (error) {
      setError(errorText(error));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="account-panel">
      <h2>Orders and receipts</h2>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button className="text-link" onClick={() => void load()}>
            Retry
          </button>
        </p>
      ) : !orders ? (
        <p role="status">Loading orders…</p>
      ) : !orders.length ? (
        <p>No orders yet.</p>
      ) : (
        <ul>
          {orders.map((order) => (
            <li key={order.reference}>
              <strong>{order.items[0]?.title ?? "Service"}</strong>
              <p>
                {order.reference} · {displayMoney(order)} ·{" "}
                {stateLabel(order.status)}
              </p>
              <ul>
                {order.payments.map((payment) => (
                  <li key={payment.reference}>
                    <Link href={"/checkout/" + payment.reference}>
                      Payment {stateLabel(payment.status)}
                    </Link>
                    {payment.receipt && (
                      <a
                        className="text-link"
                        href={receiptLink(payment.receipt.reference)}
                      >
                        Download receipt (PDF)
                      </a>
                    )}
                    {payment.refunds.map((refund) => (
                      <p key={refund.reference}>
                        {refund.reference} · {displayMoney(refund)} ·{" "}
                        {stateLabel(refund.status)}
                      </p>
                    ))}
                    {order.sandboxEnabled &&
                      payment.status === "SUCCEEDED" &&
                      order.status !== "REFUNDED" && (
                        <RefundForm payment={payment} changed={load} />
                      )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
