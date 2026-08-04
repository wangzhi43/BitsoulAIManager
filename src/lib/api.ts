import { NextResponse } from "next/server";

// 错误响应统一为 {"error": {"code", "message"}}（与 minsheng-worklog-server 约定一致）
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_many_attempts"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_many_attempts: 429,
  internal_error: 500,
};

export function apiError(code: ErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status: STATUS[code] });
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data as object, { status });
}
