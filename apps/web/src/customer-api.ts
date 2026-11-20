const origin = (
  process.env.NEXT_PUBLIC_API_ORIGIN || "http://localhost:3001"
).replace(/\/$/, "");

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function customerApi<T>(
  path: string,
  method = "GET",
  data?: object,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(origin + "/api/v1" + path, {
      method,
      credentials: "include",
      cache: "no-store",
      ...(data && {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    });
  } catch {
    throw new RequestError(
      0,
      "The marketplace could not be reached. Try again shortly.",
    );
  }
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      message?: string;
      fields?: Record<string, string>;
    };
    throw new RequestError(
      response.status,
      [
        error.message ?? "Request failed",
        ...Object.values(error.fields ?? {}),
      ].join(". "),
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}
export function authNeeded(error: unknown) {
  return error instanceof RequestError && error.status === 401;
}
export function fields(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}
export function stateLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
