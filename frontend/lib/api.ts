// Use relative URLs so Next.js proxy rewrites handle the routing.
// The next.config.ts rewrite sends /api/v1/* → http://127.0.0.1:8000/api/v1/*
// Set NEXT_PUBLIC_BACKEND_URL only when deploying outside the dev proxy.
const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  (typeof window !== "undefined" ? "" : "http://127.0.0.1:5000");

export interface ApiError {
  detail: string;
}

async function fetchApi(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("trustvault_token") : null;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers, redirect: "follow" });
  } catch (err: any) {
    throw new Error(
      "Unable to connect to TrustVault server. Please ensure the backend API is running on port 5000."
    );
  }

  // On 401, throw an error but do NOT hard-redirect or wipe the token here.
  // The AuthProvider and AuthLayout handle navigation to /login.
  // Only the authApi.me() failure path in AuthProvider should clear the token.
  if (res.status === 401) {
    const body = await res.json().catch(() => ({ detail: "Unauthorized" }));
    throw new Error(body.detail || "Session has expired or is invalid.");
  }

  if (res.status === 403) {
    const body = await res.json().catch(() => ({ detail: "Forbidden" }));
    throw new Error(body.detail || "Access denied.");
  }

  if (!res.ok) {
    let msg: string | undefined;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") {
        msg = body.detail;
      } else if (Array.isArray(body?.detail)) {
        msg = body.detail
          .map((item: any) => (typeof item === "string" ? item : item?.msg || JSON.stringify(item)))
          .join(". ");
      } else if (body?.detail && typeof body.detail === "object") {
        msg = body.detail.msg || JSON.stringify(body.detail);
      } else if (body?.message) {
        msg = typeof body.message === "string" ? body.message : JSON.stringify(body.message);
      }
    } catch {
      // Non-JSON response (e.g. Next.js proxy rewrite error 500/502/504)
    }

    if (!msg) {
      if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
        msg = "Unable to connect to TrustVault backend server. Please ensure the backend API is running on port 8000.";
      } else if (res.status === 404) {
        msg = "API endpoint not found. Please verify the backend service is running.";
      } else {
        msg = res.statusText || "Request failed";
      }
    }
    throw new Error(msg);
  }

  if (res.status === 204) return null;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: async (email: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", email);
    form.append("password", password);
    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      });
    } catch (err: any) {
      throw new Error(
        "Unable to connect to TrustVault server. Please verify the backend service is running on port 8000."
      );
    }
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const body = await res.json();
        detail = body?.detail || body?.message;
      } catch {
        // Non-JSON response (e.g. proxy 500/502/504 when backend is offline)
      }

      if (!detail) {
        if (res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504) {
          throw new Error(
            "Unable to connect to TrustVault backend server. Please verify the backend service is running on port 8000."
          );
        }
      }
      throw new Error(detail || "Login failed. Please check your credentials.");
    }
    return res.json();
  },
  logout: () => fetchApi("/api/v1/auth/logout", { method: "POST" }),
  me: () => fetchApi("/api/v1/auth/me"),
  register: (data: { email: string; full_name: string; password: string; role?: string }) =>
    fetchApi("/api/v1/auth/register", { method: "POST", body: JSON.stringify(data) }),
};
// ─── Profile / Me ─────────────────────────────────────────────────────────────

export const profileApi = {
  changePassword: (data: { current_password: string; new_password: string; confirm_password?: string; confirm_new_password?: string }) => {
    const confirm = data.confirm_new_password || data.confirm_password;
    return fetchApi("/api/v1/users/me/password", {
      method: "POST",
      body: JSON.stringify({
        current_password: data.current_password,
        new_password: data.new_password,
        confirm_new_password: confirm,
        confirm_password: confirm,
      }),
    });
  },
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetchApi("/api/v1/users/me/avatar", { method: "POST", body: form });
  },
  getAvatar: (userId: string) => fetchApi(`/api/v1/users/${userId}/avatar`),
};



// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  stats: () => fetchApi("/api/v1/dashboard/stats"),
  recentDocuments: (limit = 5) => fetchApi(`/api/v1/dashboard/recent-documents?limit=${limit}`),
  recentActivity: (limit = 10) => fetchApi(`/api/v1/dashboard/recent-activity?limit=${limit}`),
};

// ─── Documents ───────────────────────────────────────────────────────────────
// NOTE: No trailing slashes on paths — Next.js issues 308 redirects that drop
// the Authorization header, causing spurious 401 → login redirect loops.

export const documentsApi = {
  list: (params?: { search?: string; category?: string; owner?: string; from_date?: string; to_date?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.category) q.set("category", params.category);
    if (params?.owner) q.set("owner", params.owner);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const qs = q.toString();
    return fetchApi(`/api/v1/documents${qs ? `?${qs}` : ""}`);
  },
  shared: (params?: { search?: string; category?: string; owner?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.category) q.set("category", params.category);
    if (params?.owner) q.set("owner", params.owner);
    const qs = q.toString();
    return fetchApi(`/api/v1/documents/shared${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => fetchApi(`/api/v1/documents/${id}`),
  update: (id: string, data: { title?: string; description?: string; category?: string }) =>
    fetchApi(`/api/v1/documents/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => fetchApi(`/api/v1/documents/${id}`, { method: "DELETE" }),
  upload: (formData: FormData) =>
    fetchApi("/api/v1/documents/upload", { method: "POST", body: formData }),
  downloadUrl: (id: string) =>
    typeof window !== "undefined"
      ? `/api/v1/documents/${id}/download`
      : `${BACKEND_URL}/api/v1/documents/${id}/download`,
  previewUrl: (id: string) =>
    typeof window !== "undefined"
      ? `/api/v1/documents/${id}/preview`
      : `${BACKEND_URL}/api/v1/documents/${id}/preview`,
  replaceContent: (id: string, formData: FormData) =>
    fetchApi(`/api/v1/documents/${id}/content`, { method: "PUT", body: formData }),
  permissions: (id: string) => fetchApi(`/api/v1/documents/${id}/permissions`),
  grantAccess: (id: string, granteeEmail: string, permissionLevel: string) =>
    fetchApi(`/api/v1/documents/${id}/permissions`, {
      method: "POST",
      body: JSON.stringify({ grantee_email: granteeEmail, permission_level: permissionLevel }),
    }),
  batchGrant: (id: string, recipients: { grantee_email: string; permission_level: string }[]) =>
    fetchApi(`/api/v1/documents/${id}/permissions/batch`, {
      method: "POST",
      body: JSON.stringify({ recipients }),
    }),
  updatePermission: (docId: string, permId: string, permissionLevel: string) =>
    fetchApi(`/api/v1/documents/${docId}/permissions/${permId}`, {
      method: "PATCH",
      body: JSON.stringify({ permission_level: permissionLevel }),
    }),
  revokeAccess: (docId: string, permId: string) =>
    fetchApi(`/api/v1/documents/${docId}/permissions/${permId}`, { method: "DELETE" }),
  listShared: (params?: { search?: string; category?: string; owner?: string; from_date?: string; to_date?: string }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.category) q.set("category", params.category);
    if (params?.owner) q.set("owner", params.owner);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const qs = q.toString();
    return fetchApi(`/api/v1/documents/shared${qs ? `?${qs}` : ""}`);
  },
  categoriesSummary: () => fetchApi("/api/v1/documents/categories/summary"),
  transferOwnership: (id: string, data: { new_owner_id: string; reason?: string }) =>
    fetchApi(`/api/v1/documents/${id}/transfer-ownership`, { method: "POST", body: JSON.stringify(data) }),
};

// ─── Users ───────────────────────────────────────────────────────────────────

export const usersApi = {
  list: (params?: { search?: string; role?: string; is_active?: boolean; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.role) q.set("role", params.role);
    if (params?.is_active !== undefined) q.set("is_active", String(params.is_active));
    if (params?.skip !== undefined) q.set("skip", String(params.skip));
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    const qs = q.toString();
    return fetchApi(`/api/v1/users${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => fetchApi(`/api/v1/users/${id}`),
  create: (data: { email: string; full_name: string; password: string; role: string }) =>
    fetchApi("/api/v1/users", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: { full_name?: string; role?: string; is_active?: boolean }) =>
    fetchApi(`/api/v1/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  searchByEmail: (email: string) => fetchApi(`/api/v1/users/search/by-email?email=${encodeURIComponent(email)}`),
  lookup: (params?: { query?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.query) q.set("query", params.query);
    if (params?.skip !== undefined) q.set("skip", String(params.skip));
    if (params?.limit !== undefined) q.set("limit", String(params.limit));
    const qs = q.toString();
    return fetchApi(`/api/v1/users/lookup${qs ? `?${qs}` : ""}`);
  },
  offboardSummary: (id: string) => fetchApi(`/api/v1/users/${id}/offboard-summary`),
  offboard: (id: string, data: { transfer_documents_to_user_id?: string; reason?: string }) =>
    fetchApi(`/api/v1/users/${id}/offboard`, { method: "POST", body: JSON.stringify(data) }),
};

// ─── Audit ───────────────────────────────────────────────────────────────────

export const auditApi = {
  list: (params?: {
    search?: string;
    action?: string;
    outcome?: string;
    actor?: string;
    resource_id?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    page_size?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set("search", params.search);
    if (params?.action) q.set("action", params.action);
    if (params?.outcome) q.set("outcome", params.outcome);
    if (params?.actor) q.set("actor", params.actor);
    if (params?.resource_id) q.set("resource_id", params.resource_id);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return fetchApi(`/api/v1/audit${qs ? `?${qs}` : ""}`);
  },
  verify: () => fetchApi("/api/v1/audit/verify"),
  actions: () => fetchApi("/api/v1/audit/actions"),
  count: () => fetchApi("/api/v1/audit/count"),
  stats: () => fetchApi("/api/v1/audit/stats"),
  suspicious: (threshold = 3, windowMinutes?: number) => {
    const q = new URLSearchParams({ threshold: String(threshold) });
    if (windowMinutes) q.set("window_minutes", String(windowMinutes));
    return fetchApi(`/api/v1/audit/suspicious?${q}`);
  },
  my: (params?: { page?: number; page_size?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set("page", String(params.page));
    if (params?.page_size) q.set("page_size", String(params.page_size));
    const qs = q.toString();
    return fetchApi(`/api/v1/audit/my${qs ? `?${qs}` : ""}`);
  },
};
