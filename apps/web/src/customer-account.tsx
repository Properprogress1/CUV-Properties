"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ServiceRequests } from "./service-requests";
import { CommerceHistory } from "./commerce";
import {
  authNeeded,
  customerApi,
  errorText,
  fields,
  stateLabel,
} from "./customer-api";

type Profile = {
  email: string;
  displayName: string | null;
  phone: string | null;
  emailUpdates: boolean;
  emailVerifiedAt: string | null;
};
type Listing = { slug: string; title: string };
type Lead = { id: string; reference: string; status: string; listing: Listing };
type Appointment = Lead & {
  startsAt: string;
  endsAt: string;
  timeZone: string;
  version: number;
};
type Search = { id: string; name: string; query: string };
type Notice = {
  id: string;
  title: string;
  message: string;
  readAt: string | null;
};
type Dashboard = {
  profile: Profile;
  favourites: Listing[];
  searches: Search[];
  enquiries: Lead[];
  appointments: Appointment[];
  inbox: { items: Notice[]; unread: number };
};
type Mode = "login" | "register" | "forgot" | "verify" | "reset";

function searchHref(query: string) {
  const params = new URLSearchParams(query);
  const paths: Record<string, string> = {
    PROPERTY: "properties",
    LAND: "land",
    VEHICLE: "vehicles",
    SERVICE: "services",
  };
  const category = paths[params.get("category") ?? ""];
  if (category) params.delete("category");
  return "/browse" + (category ? "/" + category : "") + "?" + params;
}

export function CustomerAccount() {
  const [dashboard, setDashboard] = useState<Dashboard>();
  const [mode, setMode] = useState<Mode>("login");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [waiting, setWaiting] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const profile = await customerApi<Profile>("/account/profile");
      const [favourites, searches, enquiries, appointments, inbox] =
        await Promise.all([
          customerApi<Dashboard["favourites"]>("/account/favourites"),
          customerApi<Dashboard["searches"]>("/account/saved-searches"),
          customerApi<Dashboard["enquiries"]>("/account/enquiries"),
          customerApi<Dashboard["appointments"]>("/account/appointments"),
          customerApi<Dashboard["inbox"]>("/account/notifications"),
        ]);
      setDashboard({
        profile,
        favourites,
        searches,
        enquiries,
        appointments,
        inbox,
      });
    } catch (error) {
      setDashboard(undefined);
      if (!authNeeded(error)) setFailure(errorText(error));
    } finally {
      setWaiting(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const verify = params.get("verify");
    const reset = params.get("reset");
    if (verify || reset) {
      setToken(verify || reset || "");
      setMode(verify ? "verify" : "reset");
    }
    void load();
  }, [load]);

  async function run(
    request: () => Promise<unknown>,
    success: string,
    refresh = true,
  ) {
    setBusy(true);
    setFailure("");
    setStatus("");
    try {
      await request();
      setStatus(success);
      if (refresh) await load();
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = fields(event.currentTarget);
    void run(
      async () => {
        if (mode === "register") {
          await customerApi("/auth/register", "POST", data);
          await customerApi("/auth/login", "POST", data);
          await customerApi("/account/send-verification", "POST", {});
        } else if (mode === "forgot")
          await customerApi("/account/forgot-password", "POST", data);
        else if (mode === "verify")
          await customerApi("/account/verify-email", "POST", { token });
        else if (mode === "reset")
          await customerApi("/account/reset-password", "POST", {
            token,
            password: data.password,
          });
        else await customerApi("/auth/login", "POST", data);
        if (mode === "verify" || mode === "reset") {
          window.history.replaceState(null, "", window.location.pathname);
          setToken("");
        }
        setMode("login");
      },
      mode === "forgot"
        ? "If the account exists, a reset link will be sent."
        : mode === "verify"
          ? "Email verified."
          : mode === "reset"
            ? "Password reset. Sign in with your new password."
            : mode === "register"
              ? "Account created. Check your email for the verification link."
              : "Signed in.",
    );
  }

  const signedIn = dashboard && mode !== "verify" && mode !== "reset";
  return (
    <div className="wrap account-page cuv-account-page">
      {signedIn && (
        <header className="cuv-account-head">
          <h1>Your account</h1>
          <p>{dashboard.profile.displayName || dashboard.profile.email}</p>
          <nav aria-label="Account sections">
            <a href="#saved-listings">
              {dashboard.favourites.length} saved listings
            </a>
            <a href="#appointments">
              {dashboard.appointments.length} appointments
            </a>
            <a href="#notifications">
              {dashboard.inbox.unread} unread notifications
            </a>
            <a href="#profile">Profile</a>
          </nav>
        </header>
      )}
      {failure && (
        <p className="state" role="alert">
          {failure}
        </p>
      )}
      {status && (
        <p className="state cuv-toast" role="status">
          {status}
        </p>
      )}
      {waiting ? (
        <div className="cuv-skeleton cuv-account-loading" role="status">
          <span className="sr-only">Loading account…</span>
        </div>
      ) : !dashboard || mode === "verify" || mode === "reset" ? (
        <section className="cuv-auth">
          <div className="cuv-auth-image" aria-hidden="true" />
          <div className="cuv-auth-content">
            <h1>
              {
                {
                  login: "Sign in",
                  register: "Create an account",
                  forgot: "Reset your password",
                  verify: "Verify your email",
                  reset: "Choose a new password",
                }[mode]
              }
            </h1>
            <form
              className="engagement-form"
              onSubmit={authenticate}
              key={mode}
            >
              {mode !== "verify" && mode !== "reset" && (
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
              )}
              {mode !== "forgot" && mode !== "verify" && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    required
                  />
                </label>
              )}
              <button className="button button-dark" disabled={busy}>
                {mode === "forgot"
                  ? "Send reset link"
                  : mode === "verify"
                    ? "Verify email"
                    : mode === "reset"
                      ? "Save new password"
                      : mode === "register"
                        ? "Create account"
                        : "Sign in"}
              </button>
            </form>
            {(mode === "login" || mode === "forgot" || mode === "register") && (
              <div className="filter-actions">
                {mode === "login" ? (
                  <>
                    <button
                      className="text-link"
                      onClick={() => setMode("register")}
                    >
                      Create an account
                    </button>
                    <button
                      className="text-link"
                      onClick={() => setMode("forgot")}
                    >
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button
                    className="text-link"
                    onClick={() => setMode("login")}
                  >
                    Back to sign in
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <div className="account-grid cuv-dashboard">
          <CommerceHistory />
          <ServiceRequests />
          <section className="account-panel" id="profile">
            <h2>Profile</h2>
            <p>
              {dashboard.profile.email} ·{" "}
              {dashboard.profile.emailVerifiedAt ? "Verified" : "Unverified"}
            </p>
            {!dashboard.profile.emailVerifiedAt && (
              <button
                className="text-link"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => customerApi("/account/send-verification", "POST", {}),
                    "Verification requested.",
                    false,
                  )
                }
              >
                Send verification email
              </button>
            )}
            <form
              className="engagement-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = fields(event.currentTarget);
                void run(
                  () =>
                    customerApi("/account/profile", "PATCH", {
                      displayName: data.displayName || null,
                      phone: data.phone || null,
                      emailUpdates: data.emailUpdates === "on",
                    }),
                  "Profile saved.",
                );
              }}
            >
              <label>
                Name
                <input
                  name="displayName"
                  defaultValue={dashboard.profile.displayName ?? ""}
                  autoComplete="name"
                  maxLength={100}
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  defaultValue={dashboard.profile.phone ?? ""}
                />
              </label>
              <label className="check-line">
                <input
                  name="emailUpdates"
                  type="checkbox"
                  defaultChecked={dashboard.profile.emailUpdates}
                />{" "}
                Email updates
              </label>
              <button className="button button-dark" disabled={busy}>
                Save profile
              </button>
            </form>
            <button
              className="text-link"
              disabled={busy}
              onClick={() =>
                void run(
                  async () => {
                    await customerApi("/auth/logout", "POST");
                    setDashboard(undefined);
                  },
                  "Signed out.",
                  false,
                )
              }
            >
              Sign out
            </button>
          </section>
          <section className="account-panel" id="notifications">
            <h2>Notifications</h2>
            <p>{dashboard.inbox.unread} unread</p>
            {!dashboard.inbox.items.length && <p>No notifications yet.</p>}
            <ul>
              {dashboard.inbox.items.map((item) => (
                <li key={item.id}>
                  <strong>{item.title}</strong>
                  <p>{item.message}</p>
                  {!item.readAt && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            customerApi(
                              "/account/notifications/" + item.id + "/read",
                              "PATCH",
                            ),
                          "Marked as read.",
                        )
                      }
                    >
                      Mark as read
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="account-panel" id="saved-listings">
            <h2>Favourites</h2>
            {!dashboard.favourites.length && <p>No saved listings yet.</p>}
            <ul>
              {dashboard.favourites.map((item) => (
                <li key={item.slug}>
                  <Link href={"/listings/" + item.slug}>{item.title}</Link>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          customerApi(
                            "/account/favourites/" + item.slug,
                            "DELETE",
                          ),
                        "Listing removed.",
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="account-panel">
            <h2>Saved searches</h2>
            {!dashboard.searches.length && <p>No saved searches yet.</p>}
            <ul>
              {dashboard.searches.map((item) => (
                <li key={item.id}>
                  <Link href={searchHref(item.query)}>{item.name}</Link>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          customerApi(
                            "/account/saved-searches/" + item.id,
                            "DELETE",
                          ),
                        "Search removed.",
                      )
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="account-panel">
            <h2>Enquiries</h2>
            {!dashboard.enquiries.length && <p>No enquiries yet.</p>}
            <ul>
              {dashboard.enquiries.map((item) => (
                <li key={item.id}>
                  <strong>{item.listing.title}</strong>
                  <p>
                    {item.reference} · {stateLabel(item.status)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
          <section className="account-panel" id="appointments">
            <h2>Appointments</h2>
            {!dashboard.appointments.length && <p>No appointments yet.</p>}
            <ul>
              {dashboard.appointments.map((item) => (
                <li key={item.id}>
                  <strong>{item.listing.title}</strong>
                  <p>
                    {item.reference} · {stateLabel(item.status)}
                  </p>
                  <p>
                    {new Intl.DateTimeFormat("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: item.timeZone,
                    }).formatRange(
                      new Date(item.startsAt),
                      new Date(item.endsAt),
                    )}{" "}
                    · {item.timeZone}
                  </p>
                  {["REQUESTED", "CONFIRMED", "RESCHEDULED"].includes(
                    item.status,
                  ) && (
                    <button
                      className="text-link"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("Cancel this appointment?"))
                          void run(
                            () =>
                              customerApi(
                                "/account/appointments/" + item.id + "/cancel",
                                "POST",
                                { version: item.version },
                              ),
                            "Appointment cancelled.",
                          );
                      }}
                    >
                      Cancel appointment
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
