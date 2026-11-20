"use client";

import {
  Activity,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api, label, message } from "./api";

type OverviewReport = {
  from: string;
  to: string;
  inventory: { category: string; status: string; _count: { _all: number } }[];
  traffic: { category: string; event: string; _sum: { count: number } }[];
  overview?: {
    totalEnquiries?: number;
    upcomingAppointments?: number;
    recentListings?: {
      reference: string;
      title: string;
      status: string;
      updatedAt: string;
    }[];
  };
};

export function useOverview(
  staffId: string | undefined,
  viewingOverview: boolean,
) {
  const [result, setResult] = useState<{
    staffId: string;
    report?: OverviewReport;
    failure?: string;
  }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!staffId || !viewingOverview) return;
    let active = true;
    void api<OverviewReport>("/admin/reports").then(
      (report) => {
        if (active) setResult({ staffId, report });
      },
      (error: unknown) => {
        if (active) setResult({ staffId, failure: message(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [staffId, viewingOverview, attempt]);

  const current = result?.staffId === staffId ? result : undefined;
  return {
    report: current?.report,
    failure: current?.failure ?? "",
    retry: () => {
      setResult(undefined);
      setAttempt((value) => value + 1);
    },
  };
}

export function pendingListings(report?: OverviewReport) {
  return report?.inventory
    .filter(({ status }) => status === "DRAFT")
    .reduce((total, row) => total + row._count._all, 0);
}

const date = new Intl.DateTimeFormat("en-NG", {
  dateStyle: "medium",
  timeZone: "Africa/Lagos",
});
const number = new Intl.NumberFormat("en-NG");

export function Overview({
  enabled,
  report,
  failure,
  retry,
  openInventory,
  openReports,
}: ReturnType<typeof useOverview> & {
  enabled: boolean;
  openInventory: (() => void) | undefined;
  openReports: (() => void) | undefined;
}) {
  const properties = report?.inventory.filter(
    ({ category }) => category === "PROPERTY",
  );
  const total = properties?.reduce((sum, row) => sum + row._count._all, 0);
  const published = properties?.find(({ status }) => status === "PUBLISHED")
    ?._count._all;
  const events =
    report?.traffic.filter(({ category }) => category === "PROPERTY") ?? [];
  const max = Math.max(1, ...events.map((row) => row._sum.count));
  const stats = [
    ["Total properties", total, Building2],
    [
      "Published properties",
      report ? (published ?? 0) : undefined,
      CheckCircle2,
    ],
    ["Pending listings", pendingListings(report), ClipboardList],
    ["Total enquiries", report?.overview?.totalEnquiries, MessagesSquare],
    [
      "Upcoming appointments",
      report?.overview?.upcomingAppointments,
      CalendarDays,
    ],
  ] as const;

  return (
    <div className="overview">
      <section className="overview-hero">
        <div>
          <p>CUV Properties</p>
          <h1>Overview</h1>
          <p>Monitor your portfolio, customer enquiries and appointments.</p>
        </div>
        {openInventory && (
          <button type="button" onClick={openInventory}>
            Manage inventory <ArrowUpRight size={17} aria-hidden="true" />
          </button>
        )}
      </section>

      {!enabled ? (
        <p className="surface panel">
          Your role has access to the sections listed in the workspace
          navigation.
        </p>
      ) : (
        <>
          {failure && (
            <p className="notice error" role="alert">
              {failure}{" "}
              <button type="button" onClick={retry}>
                Retry
              </button>
            </p>
          )}
          {!report && !failure && (
            <p className="staff-sr-only" role="status">
              Loading overview…
            </p>
          )}
          <dl className="overview-stats">
            {stats.map(([title, value, Icon]) => (
              <div className="surface overview-stat" key={title}>
                <dt>
                  <span className="overview-icon">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  {title}
                </dt>
                <dd>
                  {value !== undefined ? (
                    number.format(value)
                  ) : !report && !failure ? (
                    <span className="staff-skeleton" aria-hidden="true" />
                  ) : (
                    <span
                      className="overview-unavailable"
                      aria-label="Unavailable"
                    >
                      —
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="overview-detail">
            <section
              className="surface panel overview-card"
              aria-label="Property performance"
            >
              <div className="overview-card-heading">
                <div>
                  <h2>Property performance</h2>
                  {report && (
                    <p>
                      {date.format(new Date(report.from))} –{" "}
                      {date.format(new Date(report.to))}
                    </p>
                  )}
                </div>
                {openReports && (
                  <button type="button" onClick={openReports}>
                    View reports <ArrowUpRight size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
              {events.length ? (
                <ul className="overview-bars">
                  {events.map(({ event, _sum: { count } }) => (
                    <li key={event}>
                      <span>{label(event)}</span>
                      <strong>{number.format(count)}</strong>
                      <div aria-hidden="true">
                        <span style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                report && (
                  <p className="overview-empty">
                    <Activity size={22} aria-hidden="true" /> No property events
                    recorded in this period.
                  </p>
                )
              )}
            </section>
            <section className="surface panel overview-card">
              <div className="overview-card-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>Latest listing updates</p>
                </div>
              </div>
              {report?.overview?.recentListings?.length ? (
                <ul className="overview-activity">
                  {report.overview.recentListings.map((item) => (
                    <li key={item.reference}>
                      <span className="overview-icon">
                        <Building2 size={16} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{item.title}</strong>
                        <p>
                          {label(item.status)} ·{" "}
                          {date.format(new Date(item.updatedAt))}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                report && (
                  <p className="overview-empty">
                    {report.overview?.recentListings
                      ? "No listing updates yet."
                      : "Recent listing activity is unavailable."}
                  </p>
                )
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
