// S05-4: every unknown /api path and method answers the same 404.
import { apiError } from "@/lib/server/http/errors";
import { errorResponse } from "@/lib/server/http/respond";

const notFound = () => Promise.resolve(errorResponse(apiError("not_found")));

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
