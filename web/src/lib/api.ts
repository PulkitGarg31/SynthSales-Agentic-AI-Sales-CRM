import type {
  Agent,
  AppNotification,
  Campaign,
  Company,
  CompanyDetail,
  Contact,
  Dashboard,
  EmailDraft,
  LogEntry,
  Meeting,
  PipelineAgent,
  RegisterResponse,
  ResendResponse,
  Thread,
  ThreadDetail,
  Token,
  User,
} from "./api-types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "reachly_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FetchOpts = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  form?: FormData;
};

async function request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, form } = opts;
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: payload,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail ?? detail;
      if (Array.isArray(detail)) detail = detail.map((d) => d.msg).join(", ");
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, String(detail));
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ---- auth ----
  register: (name: string, email: string, password: string) =>
    request<RegisterResponse>("/api/auth/register", {
      method: "POST",
      auth: false,
      body: { name, email, password },
    }),
  verifyOtp: (email: string, code: string) =>
    request<Token>("/api/auth/verify-otp", {
      method: "POST",
      auth: false,
      body: { email, code },
    }),
  resendOtp: (email: string) =>
    request<ResendResponse>(`/api/auth/resend-otp?email=${encodeURIComponent(email)}`, {
      method: "POST",
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<Token>("/api/auth/login", {
      method: "POST",
      auth: false,
      body: { email, password },
    }),
  me: () => request<User>("/api/auth/me"),
  setOutbound: (enabled: boolean) =>
    request<User>("/api/auth/me", {
      method: "PATCH",
      body: { outbound_enabled: enabled },
    }),

  // ---- dashboard ----
  dashboard: () => request<Dashboard>("/api/dashboard"),

  // ---- campaigns ----
  campaigns: () => request<Campaign[]>("/api/campaigns"),
  campaign: (id: number) => request<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (data: Record<string, unknown>) =>
    request<Campaign>("/api/campaigns", { method: "POST", body: data }),
  updateCampaign: (id: number, data: Record<string, unknown>) =>
    request<Campaign>(`/api/campaigns/${id}`, { method: "PATCH", body: data }),
  deleteCampaign: (id: number) =>
    request<void>(`/api/campaigns/${id}`, { method: "DELETE" }),
  duplicateCampaign: (id: number) =>
    request<Campaign>(`/api/campaigns/${id}/duplicate`, { method: "POST" }),
  campaignCompanies: (id: number) =>
    request<Company[]>(`/api/campaigns/${id}/companies`),
  uploadCompanies: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ added: number; skipped: number }>(
      `/api/campaigns/${id}/companies/upload`,
      { method: "POST", form }
    );
  },
  runCampaign: (id: number) =>
    request<{ detail: string; companies: number }>(`/api/campaigns/${id}/run`, {
      method: "POST",
    }),
  campaignPipeline: (id: number) =>
    request<PipelineAgent[]>(`/api/campaigns/${id}/pipeline`),
  runCampaignAgent: (id: number, key: string, force = false) =>
    request<{ detail: string }>(`/api/campaigns/${id}/run-agent`, {
      method: "POST",
      body: { key, force },
    }),

  // ---- companies ----
  company: (id: number) => request<CompanyDetail>(`/api/companies/${id}`),
  setCompanyStatus: (id: number, status: string) =>
    request<CompanyDetail>(`/api/companies/${id}/status`, {
      method: "PATCH",
      body: { status },
    }),
  enrichCompany: (id: number) =>
    request<CompanyDetail>(`/api/companies/${id}/enrich`, { method: "POST" }),
  findContacts: (id: number) =>
    request<CompanyDetail>(`/api/companies/${id}/find-contacts`, { method: "POST" }),

  // ---- contacts ----
  contacts: (campaignId?: number) =>
    request<Contact[]>(
      `/api/contacts${campaignId ? `?campaign_id=${campaignId}` : ""}`
    ),
  updateContact: (id: number, data: Partial<Contact>) =>
    request<Contact>(`/api/contacts/${id}`, { method: "PATCH", body: data }),

  // ---- emails ----
  drafts: (campaignId?: number) =>
    request<EmailDraft[]>(
      `/api/emails${campaignId ? `?campaign_id=${campaignId}` : ""}`
    ),
  updateDraft: (id: number, data: Partial<EmailDraft>) =>
    request<EmailDraft>(`/api/emails/${id}`, { method: "PATCH", body: data }),
  regenerateDraft: (id: number) =>
    request<EmailDraft>(`/api/emails/${id}/regenerate`, { method: "POST" }),
  testDraft: (id: number) =>
    request<{ detail: string; mode: string }>(`/api/emails/${id}/test`, {
      method: "POST",
    }),

  // ---- conversations ----
  threads: (campaignId?: number) =>
    request<Thread[]>(
      `/api/conversations${campaignId ? `?campaign_id=${campaignId}` : ""}`
    ),
  thread: (id: number) => request<ThreadDetail>(`/api/conversations/${id}`),
  reply: (id: number, body: string) =>
    request<ThreadDetail>(`/api/conversations/${id}/reply`, {
      method: "POST",
      body: { body },
    }),
  sendFromDraft: (draftId: number) =>
    request<ThreadDetail>("/api/conversations/send", {
      method: "POST",
      body: { draft_id: draftId },
    }),
  bookMeeting: (
    threadId: number,
    data: { scheduled_at: string; link: string; notes?: string }
  ) =>
    request<ThreadDetail>(`/api/conversations/${threadId}/book-meeting`, {
      method: "POST",
      body: data,
    }),

  // ---- meetings ----
  meetings: (status?: string) =>
    request<Meeting[]>(`/api/meetings${status ? `?status=${status}` : ""}`),
  updateMeeting: (id: number, data: { status: string; notes?: string }) =>
    request<Meeting>(`/api/meetings/${id}`, { method: "PATCH", body: data }),

  // ---- notifications ----
  notifications: (unreadOnly = false) =>
    request<AppNotification[]>(
      `/api/notifications${unreadOnly ? "?unread_only=true" : ""}`
    ),
  markAllRead: () =>
    request<{ detail: string }>("/api/notifications/read-all", { method: "POST" }),
  markRead: (id: number) =>
    request<AppNotification>(`/api/notifications/${id}/read`, { method: "PATCH" }),

  // ---- agents ----
  agents: () => request<Agent[]>("/api/agents"),
  updateAgent: (id: number, enabled: boolean) =>
    request<Agent>(`/api/agents/${id}`, { method: "PATCH", body: { enabled } }),
  runTracking: () =>
    request<{ follow_ups_sent: number }>("/api/agents/run-tracking", {
      method: "POST",
    }),

  // ---- logs ----
  logs: (category?: string) =>
    request<LogEntry[]>(
      `/api/logs${category && category !== "All" ? `?category=${category}` : ""}`
    ),
};
