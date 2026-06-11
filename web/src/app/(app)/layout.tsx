"use client";

import { useState } from "react";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastProvider } from "@/components/ui/Toast";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/**
 * Authenticated app shell: ToastProvider must sit OUTSIDE AuthProvider so
 * toast consumers (Bell, useAction) work anywhere under the guard; the WS
 * subscription that feeds both bell + toasts lives in <Bell>.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <AuthProvider>
        <div className="min-h-screen bg-cream">
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
          <div className="flex min-h-screen flex-col lg:pl-60">
            <Topbar onMenu={() => setMenuOpen(true)} />
            <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </AuthProvider>
    </ToastProvider>
  );
}
