"use client";

import { useEffect } from "react";
import { API_URL } from "@/lib/api";

export function BackendWarmup() {
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 60000);

    fetch(`${API_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => {}).finally(() => window.clearTimeout(timer));

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  return null;
}