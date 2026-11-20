"use client";

import type { CatalogQuery } from "@marketplace/inventory";
import { BookmarkPlus } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { authNeeded, customerApi, errorText, fields } from "./customer-api";

function useSubmission() {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(request: () => Promise<string>) {
    setStatus("");
    setError("");
    setLogin(false);
    setBusy(true);
    try {
      setStatus(await request());
    } catch (error) {
      if (authNeeded(error)) setLogin(true);
      else setError(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  return {
    submit,
    busy,
    feedback: (
      <>
        {status && <p role="status">{status}</p>}
        {error && <p role="alert">{error}</p>}
        {login && (
          <p>
            <Link href="/account">Sign in or create an account</Link> to use
            this feature.
          </p>
        )}
      </>
    ),
  };
}

export function SaveSearch({ filters }: { filters: CatalogQuery }) {
  const state = useSubmission();
  return (
    <form
      className="save-search filter-actions"
      onSubmit={(event) => {
        event.preventDefault();
        const { name } = fields(event.currentTarget);
        void state.submit(async () => {
          await customerApi("/account/saved-searches", "POST", {
            name,
            filters,
          });
          return "Search saved to your account.";
        });
      }}
    >
      <label>
        Save this search
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          placeholder="Search name"
        />
      </label>
      <button className="button button-light" disabled={state.busy}>
        Save search
      </button>
      {state.feedback}
    </form>
  );
}

export function SaveListing({ slug }: { slug: string }) {
  const state = useSubmission();
  return (
    <div>
      <button
        className="button button-light"
        disabled={state.busy}
        onClick={() =>
          void state.submit(async () => {
            await customerApi(
              "/account/favourites/" + encodeURIComponent(slug),
              "PUT",
            );
            return "Listing saved to your favourites.";
          })
        }
      >
        <BookmarkPlus size={17} aria-hidden="true" /> Save listing
      </button>
      {state.feedback}
    </div>
  );
}

export function ListingEngagement({ slug }: { slug: string }) {
  const enquiry = useSubmission();
  const booking = useSubmission();
  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { name, email, phone, channel, message, consent } = fields(
      event.currentTarget,
    );
    void enquiry.submit(async () => {
      const result = await customerApi<{ reference: string }>(
        "/enquiries",
        "POST",
        {
          slug,
          name,
          email,
          ...(phone && { phone }),
          channel,
          message,
          consent: consent === "on",
        },
      );
      return "Enquiry received. Reference " + result.reference;
    });
  }
  function book(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = fields(event.currentTarget);
    void booking.submit(async () => {
      const startsAt = new Date(String(data.startsAt)).toISOString();
      const endsAt = new Date(String(data.endsAt)).toISOString();
      const draft = await customerApi<{ reference: string }>(
        "/account/appointments",
        "POST",
        {
          slug,
          notes: data.notes,
          window: {
            startsAt,
            endsAt,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        },
      );
      return "Appointment requested. Reference " + draft.reference;
    });
  }
  return (
    <section id="engagement" className="detail-section account-grid">
      <div className="account-panel">
        <h2>Enquire</h2>
        <form className="engagement-form" onSubmit={send}>
          <label>
            Name
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={100}
              required
            />
          </label>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Phone
            <input name="phone" type="tel" autoComplete="tel" />
          </label>
          <label>
            Preferred contact
            <select name="channel">
              <option value="EMAIL">Email</option>
              <option value="PHONE">Phone</option>
              <option value="WHATSAPP">WhatsApp</option>
            </select>
          </label>
          <label>
            Message
            <textarea name="message" minLength={10} maxLength={2500} required />
          </label>
          <label className="check-line">
            <input name="consent" type="checkbox" required /> I agree to be
            contacted about this enquiry.
          </label>
          <button className="button button-dark" disabled={enquiry.busy}>
            Send enquiry
          </button>
          {enquiry.feedback}
        </form>
      </div>
      <div className="account-panel">
        <h2>Request an appointment</h2>
        <p>Times use your device’s time zone.</p>
        <form className="engagement-form" onSubmit={book}>
          <label>
            Earliest time
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Latest time
            <input name="endsAt" type="datetime-local" required />
          </label>
          <label>
            Notes
            <textarea name="notes" maxLength={1500} />
          </label>
          <button className="button button-dark" disabled={booking.busy}>
            Request appointment
          </button>
          {booking.feedback}
        </form>
      </div>
    </section>
  );
}
