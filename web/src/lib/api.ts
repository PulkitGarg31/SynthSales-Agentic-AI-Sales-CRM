import type {
  AdminCampaignDetail,
  AdminCampaignRow,
  AdminUserRow,
  AdminUserTree,
  Agent,
  AppNotification,
  AuthProviders,
  Campaign,
  CampaignCreate,
  Company,
  CompanyDetail,
  Contact,
  ContactCreate,
  Dashboard,
  EmailDraft,
  ForgotPasswordResponse,
  HealthOut,
  LogEntry,
  Meeting,
  PipelineAgent,
  RegisterResponse,
  ResendResponse,
  SyncResult,
  Thread,
  ThreadDetail,
  Token,
  User,
} from "./api-types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const TOKEN_KEY = "sellari_token";

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

// Full-page entry point for the Google OAuth flow. It's a browser navigation
// (the backend 302s to Google), not a fetch - so it's a URL, not an api method.
export const googleStartUrl = () => `${API_URL}/api/auth/google/start`;

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

  // Only an *authenticated* 401 means an expired session; a 401 from e.g.
  // a failed login is bad credentials and must not clear or redirect.
  if (res.status === 401 && auth && typeof window !== "undefined") {
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
  forgotPassword: (email: string) =>
    request<ForgotPasswordResponse>("/api/auth/forgot-password", {
      method: "POST",
      auth: false,
      body: { email },
    }),
  resetPassword: (email: string, code: string, new_password: string) =>
    request<{ detail: string }>("/api/auth/reset-password", {
      method: "POST",
      auth: false,
      body: { email, code, new_password },
    }),
  authProviders: () =>
    request<AuthProviders>("/api/auth/providers", { auth: false }),
  // Public marketing-site contact form (throttled per IP server-side).
  contactUs: (data: { name: string; email: string; message: string }) =>
    request<{ detail: string }>("/api/contact", { method: "POST", auth: false, body: data }),
  me: () => request<User>("/api/auth/me"),
  setOutbound: (enabled: boolean) =>
    request<User>("/api/auth/me", {
      method: "PATCH",
      body: { outbound_enabled: enabled },
    }),
  connectCalendar: () =>
    request<{ url: string }>("/api/auth/google/calendar/connect"),
  disconnectCalendar: () =>
    request<User>("/api/auth/google/calendar/disconnect", { method: "POST" }),
  connectMailbox: () =>
    request<{ url: string }>("/api/auth/google/mailbox/connect"),
  disconnectMailbox: () =>
    request<User>("/api/auth/google/mailbox/disconnect", { method: "POST" }),

  // ---- dashboard ----
  dashboard: () => request<Dashboard>("/api/dashboard"),

  // ---- campaigns ----
  campaigns: () => request<Campaign[]>("/api/campaigns"),
  campaign: (id: number) => request<Campaign>(`/api/campaigns/${id}`),
  createCampaign: (data: CampaignCreate) =>
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
  setMailDomain: (id: number, mail_domain: string) =>
    request<CompanyDetail>(`/api/companies/${id}/mail-domain`, {
      method: "PATCH",
      body: { mail_domain },
    }),
  enrichCompany: (id: number) =>
    request<CompanyDetail>(`/api/companies/${id}/enrich`, { method: "POST" }),
  findContacts: (id: number) =>
    request<CompanyDetail>(`/api/companies/${id}/find-contacts`, { method: "POST" }),
  addContact: (companyId: number, data: ContactCreate) =>
    request<CompanyDetail>(`/api/companies/${companyId}/contacts`, { method: "POST", body: data }),

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
    data: {
      scheduled_at: string;
      link?: string;
      notes?: string;
      duration_minutes?: number;
    }
  ) =>
    request<ThreadDetail>(`/api/conversations/${threadId}/book-meeting`, {
      method: "POST",
      body: data,
    }),
  syncInbox: () =>
    request<SyncResult>("/api/conversations/sync", { method: "POST" }),
  overrideStage: (
    threadId: number,
    data: { stage?: string; clear_do_not_contact?: boolean }
  ) =>
    request<ThreadDetail>(`/api/conversations/${threadId}/stage`, {
      method: "PATCH",
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
  logs: (category?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (category && category !== "All") params.set("category", category);
    if (limit) params.set("limit", String(limit));
    const qs = params.toString();
    return request<LogEntry[]>(`/api/logs${qs ? `?${qs}` : ""}`);
  },

  // ---- system ----
  health: () => request<HealthOut>("/health", { auth: false }),

  // ---- admin (cross-tenant; requires is_admin) ----
  adminUsers: () => request<AdminUserRow[]>("/api/admin/users"),
  adminUserTree: (id: number) =>
    request<AdminUserTree>(`/api/admin/users/${id}`),
  adminDeleteUser: (id: number) =>
    request<void>(`/api/admin/users/${id}`, { method: "DELETE" }),
  adminSetAdmin: (id: number, value: boolean) =>
    request<AdminUserRow>(`/api/admin/users/${id}/admin`, {
      method: "POST",
      body: { value },
    }),
  adminCampaigns: () => request<AdminCampaignRow[]>("/api/admin/campaigns"),
  adminCampaignDetail: (id: number) =>
    request<AdminCampaignDetail>(`/api/admin/campaigns/${id}`),
  adminDeleteCampaign: (id: number) =>
    request<void>(`/api/admin/campaigns/${id}`, { method: "DELETE" }),
};
