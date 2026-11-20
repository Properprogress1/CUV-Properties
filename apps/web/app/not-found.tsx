import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap cuv-document cuv-fallback">
      <h1>Page unavailable</h1>
      <p>The page you requested may have moved or been removed.</p>
      <Link className="button button-dark" href="/browse">
        Browse listings
      </Link>
    </div>
  );
}
