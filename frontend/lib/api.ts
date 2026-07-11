const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/backend-api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const parsed = JSON.parse(body) as { detail?: string };
      message = parsed.detail || body;
    } catch {
      // The backend may return plain text for proxy or infrastructure errors.
    }
    if (response.status === 401 && !["/auth/login", "/auth/me"].includes(path) && typeof window !== "undefined") {
      window.dispatchEvent(new Event("recall-forge:auth-expired"));
    }
    throw new ApiError(message || `Request failed: ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}
