import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { webhookPath } from "./commerce/provider";

export interface Request extends IncomingMessage {
  id: string;
  path: string;
  ip?: string;
}

export interface Response extends ServerResponse {
  status(status: number): Response;
  json(body: object): void;
}

const logger = new Logger("HTTP");
const methodsWithoutWrites = new Set(["GET", "HEAD", "OPTIONS"]);
const maxTrackedAddresses = 10_000;
const windowMs = 60_000;

function sendError(
  request: Request,
  response: Response,
  status: number,
  message: string,
  fields?: unknown,
) {
  response
    .status(status)
    .json({ code: `HTTP_${status}`, message, fields, requestId: request.id });
}

export function requestMiddleware(origins: readonly string[]) {
  let windowStarted = Date.now();
  const attempts = new Map<string, number>();

  return (request: Request, response: Response, next: () => void) => {
    request.id = randomUUID();
    const start = Date.now();
    response.setHeader("X-Request-ID", request.id);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.on("finish", () => {
      logger.log({
        requestId: request.id,
        method: request.method,
        status: response.statusCode,
        durationMs: Date.now() - start,
      });
    });

    if (
      !methodsWithoutWrites.has(request.method ?? "") &&
      !(request.method === "POST" && request.path === webhookPath) &&
      !origins.includes(request.headers.origin ?? "")
    ) {
      sendError(request, response, 403, "Request origin is not allowed");
      return;
    }

    const authPath = /^\/api\/v1\/auth\/(login|register)\/?$/i.test(
      request.path,
    );
    const accountPath =
      /^\/api\/v1\/(account\/(forgot-password|reset-password|verify-email|send-verification))\/?$/i.test(
        request.path,
      );
    const enquiryPath = /^\/api\/v1\/enquiries\/?$/i.test(request.path);
    const analyticsPath = /^\/api\/v1\/analytics\/events\/?$/i.test(
      request.path,
    );
    if (
      request.method === "POST" &&
      (authPath || accountPath || enquiryPath || analyticsPath)
    ) {
      if (Date.now() - windowStarted >= windowMs) {
        attempts.clear();
        windowStarted = Date.now();
      }
      const ip = request.ip ?? request.socket.remoteAddress ?? "unknown";
      const key =
        (analyticsPath
          ? "metrics:"
          : accountPath
            ? "account:"
            : enquiryPath
              ? "enquiry:"
              : "auth:") + ip;
      const count = attempts.get(key) ?? 0;
      const full = count === 0 && attempts.size >= maxTrackedAddresses;
      if (count >= (analyticsPath ? 120 : enquiryPath ? 5 : 12) || full) {
        response.setHeader(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil((windowStarted + windowMs - Date.now()) / 1000),
            ),
          ),
        );
        sendError(
          request,
          response,
          429,
          "Too many attempts. Try again shortly.",
        );
        return;
      }
      attempts.set(key, count + 1);
    }
    next();
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    if (response.headersSent) return;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      const details =
        typeof body === "string"
          ? { message: body }
          : (body as { message?: unknown; fields?: unknown });
      const message =
        typeof details.message === "string"
          ? details.message
          : exception.message;
      sendError(
        request,
        response,
        exception.getStatus(),
        message,
        details.fields,
      );
      return;
    }

    logger.error({
      requestId: request.id,
      errorType: exception instanceof Error ? exception.name : "Unknown",
    });
    sendError(request, response, 500, "Internal server error");
  }
}
