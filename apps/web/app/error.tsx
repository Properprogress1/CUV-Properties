"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="wrap cuv-document cuv-fallback">
      <h1>Listings are temporarily unavailable</h1>
      <div className="filter-actions">
        <button className="button button-dark" onClick={reset}>
          Try again
        </button>
        <Link href="/">Back to home</Link>
      </div>
    </div>
  );
}
