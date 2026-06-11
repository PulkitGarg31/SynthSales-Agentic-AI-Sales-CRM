"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api, clearToken, getToken } from "@/lib/api";
import type { User } from "@/lib/api-types";
import { wsDisconnect } from "@/lib/ws";

interface AuthCtx {
  /** The signed-in user — non-null everywhere inside the provider. */
  me: User;
  /** Re-fetch /me (e.g. after toggling outbound or connecting an integration). */
  refresh: () => Promise<void>;
  /** Clear token, tear down the WS connection, and return to /login. */
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/**
 * Wraps the authenticated (app) route group: loads the current user, redirects
 * to /login when there is no (valid) token, and renders a brand splash until
 * the user is known — protected content never flashes unauthenticated.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    try {
      setMe(await api.me());
    } catch {
      // An authenticated 401 already cleared the token and redirected inside
      // api.ts; this covers network failures and other error statuses.
      clearToken();
      router.replace("/login");
    }
  }, [router]);

  const signOut = useCallback(() => {
    clearToken();
    wsDisconnect();
    setMe(null);
    router.replace("/login");
  }, [router]);

  useEffect(() => {
    // setState happens only inside the promise callback (refresh awaits /me),
    // never synchronously in the effect body.
    queueMicrotask(() => void refresh());
  }, [refresh]);

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <Image
          src="/brand/emblem.png"
          alt="Sellari AI"
          width={742}
          height={894}
          sizes="64px"
          priority
          className="h-16 w-auto animate-pulse motion-reduce:animate-none"
        />
      </div>
    );
  }

  return <Ctx.Provider value={{ me, refresh, signOut }}>{children}</Ctx.Provider>;
}
