export type Staff = {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
};
export const apiOrigin =
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001";
const apiRoot = apiOrigin.replace(/\/$/, "") + "/api/v1";
export const mediaUrl = (listingId: string, mediaId: string) =>
  `${apiRoot}/admin/listings/${listingId}/media/${mediaId}`;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method = "GET",
  data?: object,
): Promise<T> {
  const multipart = data instanceof FormData;
  const request: RequestInit = {
    method,
    credentials: "include",
    cache: "no-store",
  };
  if (data) {
    request.body = multipart ? data : JSON.stringify(data);
    if (!multipart) request.headers = { "Content-Type": "application/json" };
  }
  let response: Response;
  try {
    response = await fetch(apiRoot + path, request);
  } catch {
    throw new ApiError(
      0,
      "Could not reach the API. Check your connection and try again.",
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      message?: string;
      fields?: Record<string, string>;
    };
    const fields = Object.entries(payload.fields ?? {})
      .map(([name, message]) => `${name}: ${message}`)
      .join(" · ");
    throw new ApiError(
      response.status,
      [payload.message ?? "Request failed", fields].filter(Boolean).join(". "),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Try again.";
}

export function label(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (char) => char.toUpperCase());
}
