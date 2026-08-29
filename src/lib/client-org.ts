"use client";

const ACTIVE_ORG_KEY = "agencyos.activeOrgId";

export function getActiveOrgId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const value = window.localStorage.getItem(ACTIVE_ORG_KEY);
  if (!value) {
    return null;
  }
  return value.trim().length > 0 ? value : null;
}

export function setActiveOrgId(orgId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
}

export function clearActiveOrgId(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ACTIVE_ORG_KEY);
}
