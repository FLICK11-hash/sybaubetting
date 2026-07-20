import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./errors";

export { ApiError };

/** Wraps a route handler with consistent error -> HTTP status mapping. Never leaks internal error details for 500s. */
export function withApiErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
      }
      console.error("Unhandled API error:", err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
