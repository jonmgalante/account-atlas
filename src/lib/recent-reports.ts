export type RecentReportRecord = {
  shareId: string;
  companyUrl: string;
  createdAt: string;
};

const STORAGE_KEY = "account-atlas.recent-reports";
export const RECENT_REPORTS_UPDATED_EVENT = "account-atlas:recent-reports-updated";

export function readRecentReports(): RecentReportRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as RecentReportRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentReport(record: RecentReportRecord) {
  if (typeof window === "undefined") {
    return;
  }

  const next = [record, ...readRecentReports().filter((item) => item.shareId !== record.shareId)].slice(0, 6);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(RECENT_REPORTS_UPDATED_EVENT));
}

