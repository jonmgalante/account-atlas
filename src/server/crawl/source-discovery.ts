import "server-only";

import type { SourceType } from "@/lib/source";
import { isCompanyHostname, normalizeDiscoveredUrl } from "@/lib/url";
import type { CrawlCandidate, CrawlCandidateKind, DiscoveredLink } from "@/server/crawl/types";

const PDF_PATTERN = /\.pdf(?:$|[?#])/i;
const SKIPPED_SCHEMES = ["mailto:", "tel:", "javascript:"];
const SKIPPED_PATH_PATTERNS = [
  /^\/cdn-cgi\//i,
  /^\/wp-admin\//i,
  /^\/login(?:\/|$)/i,
  /^\/signin(?:\/|$)/i,
  /^\/signup(?:\/|$)/i,
  /^\/cart(?:\/|$)/i,
  /^\/checkout(?:\/|$)/i,
];

type SourceRule = {
  sourceType: SourceType;
  priority: number;
  patterns: RegExp[];
};

const SOURCE_RULES: SourceRule[] = [
  { sourceType: "about_page", priority: 880, patterns: [/^\/about(?:\/|$)/i, /^\/company(?:\/|$)/i, /who-we-are/i] },
  {
    sourceType: "product_page",
    priority: 860,
    patterns: [/^\/product(?:s)?(?:\/|$)/i, /^\/platform(?:\/|$)/i, /product/i],
  },
  {
    sourceType: "solutions_page",
    priority: 840,
    patterns: [/^\/solution(?:s)?(?:\/|$)/i, /use-case/i, /industry/i],
  },
  { sourceType: "pricing_page", priority: 830, patterns: [/^\/pricing(?:\/|$)/i, /^\/plans?(?:\/|$)/i] },
  {
    sourceType: "customer_page",
    priority: 820,
    patterns: [/^\/customers?(?:\/|$)/i, /case-stud/i, /customer-stor/i, /success-stor/i],
  },
  { sourceType: "security_page", priority: 810, patterns: [/^\/security(?:\/|$)/i, /^\/trust(?:\/|$)/i] },
  { sourceType: "privacy_page", priority: 800, patterns: [/^\/privacy(?:\/|$)/i, /data-processing/i, /gdpr/i] },
  { sourceType: "docs_page", priority: 790, patterns: [/^\/docs(?:\/|$)/i, /^\/documentation(?:\/|$)/i] },
  { sourceType: "developer_page", priority: 780, patterns: [/^\/developers?(?:\/|$)/i, /^\/api(?:\/|$)/i, /sdk/i] },
  { sourceType: "careers_page", priority: 770, patterns: [/^\/careers?(?:\/|$)/i, /^\/jobs?(?:\/|$)/i] },
  { sourceType: "blog_page", priority: 760, patterns: [/^\/blog(?:\/|$)/i] },
  { sourceType: "newsroom_page", priority: 750, patterns: [/^\/news(?:\/|$)/i, /^\/newsroom(?:\/|$)/i, /^\/press(?:\/|$)/i] },
  {
    sourceType: "investor_relations_page",
    priority: 740,
    patterns: [/^\/investors?(?:\/|$)/i, /^\/ir(?:\/|$)/i, /investor-relations/i],
  },
  { sourceType: "status_page", priority: 730, patterns: [/^\/status(?:\/|$)/i] },
  {
    sourceType: "changelog_page",
    priority: 720,
    patterns: [/^\/changelog(?:\/|$)/i, /release-notes/i, /product-updates/i],
  },
];

const ROOT_FALLBACKS: Array<{ path: string; sourceType: SourceType; priority: number }> = [
  { path: "/", sourceType: "company_homepage", priority: 1000 },
  { path: "/about", sourceType: "about_page", priority: 880 },
  { path: "/products", sourceType: "product_page", priority: 860 },
  { path: "/solutions", sourceType: "solutions_page", priority: 840 },
  { path: "/pricing", sourceType: "pricing_page", priority: 830 },
  { path: "/customers", sourceType: "customer_page", priority: 820 },
  { path: "/security", sourceType: "security_page", priority: 810 },
  { path: "/privacy", sourceType: "privacy_page", priority: 800 },
  { path: "/docs", sourceType: "docs_page", priority: 790 },
  { path: "/developers", sourceType: "developer_page", priority: 780 },
  { path: "/careers", sourceType: "careers_page", priority: 770 },
  { path: "/blog", sourceType: "blog_page", priority: 760 },
  { path: "/newsroom", sourceType: "newsroom_page", priority: 750 },
  { path: "/investors", sourceType: "investor_relations_page", priority: 740 },
  { path: "/status", sourceType: "status_page", priority: 730 },
  { path: "/changelog", sourceType: "changelog_page", priority: 720 },
];

function classifyPdfLink(url: URL, anchorText: string | null) {
  const target = `${url.pathname} ${anchorText ?? ""}`.toLowerCase();

  if (/(investor|annual report|quarterly report|earnings|10-k|10-q|shareholder)/i.test(target)) {
    return {
      kind: "pdf" as const,
      sourceType: "investor_report" as const,
      priority: 745,
    };
  }

  return {
    kind: "pdf" as const,
    sourceType: "pdf_document" as const,
    priority: 700,
  };
}

function classifyHtmlUrl(url: URL, anchorText: string | null) {
  if (url.pathname === "/" || url.pathname === "") {
    return {
      kind: "html" as const,
      sourceType: "company_homepage" as const,
      priority: 1000,
    };
  }

  const pathname = url.pathname.toLowerCase();
  const target = `${pathname} ${anchorText ?? ""}`.toLowerCase();

  for (const rule of SOURCE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(pathname) || pattern.test(target))) {
      return {
        kind: "html" as const,
        sourceType: rule.sourceType,
        priority: rule.priority,
      };
    }
  }

  return {
    kind: "html" as const,
    sourceType: "company_site" as const,
    priority: 500,
  };
}

function shouldSkipUrl(url: URL) {
  return SKIPPED_PATH_PATTERNS.some((pattern) => pattern.test(url.pathname));
}

export function classifyDiscoveredCandidate(
  rawUrl: string,
  baseUrl: string,
  canonicalDomain: string,
  anchorText: string | null,
): CrawlCandidate | null {
  if (SKIPPED_SCHEMES.some((scheme) => rawUrl.toLowerCase().startsWith(scheme))) {
    return null;
  }

  let normalizedUrl: string;

  try {
    normalizedUrl = normalizeDiscoveredUrl(rawUrl, baseUrl);
  } catch {
    return null;
  }

  const parsedUrl = new URL(normalizedUrl);

  if (!isCompanyHostname(parsedUrl.hostname, canonicalDomain) || shouldSkipUrl(parsedUrl)) {
    return null;
  }

  const discovery = PDF_PATTERN.test(parsedUrl.pathname) ? classifyPdfLink(parsedUrl, anchorText) : classifyHtmlUrl(parsedUrl, anchorText);

  return {
    url: normalizedUrl,
    kind: discovery.kind,
    priority: discovery.priority,
    sourceType: discovery.sourceType,
    anchorText,
    discoveredFromUrl: baseUrl,
    discoveredAt: new Date(),
  };
}

export function buildInitialCrawlCandidates(startUrl: string, canonicalDomain: string) {
  const start = new URL(startUrl);
  const rootUrl = `${start.protocol}//${start.host}/`;
  const candidates = new Map<string, CrawlCandidate>();

  for (const candidate of ROOT_FALLBACKS) {
    const seededUrl = new URL(candidate.path, rootUrl).toString();

    if (!isCompanyHostname(new URL(seededUrl).hostname, canonicalDomain)) {
      continue;
    }

    candidates.set(seededUrl, {
      url: seededUrl,
      kind: candidate.path.endsWith(".pdf") ? "pdf" : "html",
      priority: candidate.priority,
      sourceType: candidate.sourceType,
      anchorText: null,
      discoveredFromUrl: null,
      discoveredAt: new Date(),
    });
  }

  const seededStart = classifyDiscoveredCandidate(startUrl, rootUrl, canonicalDomain, null);

  if (seededStart) {
    const current = candidates.get(seededStart.url);
    candidates.set(seededStart.url, current && current.priority > seededStart.priority ? current : seededStart);
  }

  return [...candidates.values()].sort((left, right) => right.priority - left.priority);
}

export function mergeDiscoveredCandidates(
  existing: Map<string, CrawlCandidate>,
  links: DiscoveredLink[],
  baseUrl: string,
  canonicalDomain: string,
) {
  for (const link of links) {
    const candidate = classifyDiscoveredCandidate(link.url, baseUrl, canonicalDomain, link.anchorText);

    if (!candidate) {
      continue;
    }

    const current = existing.get(candidate.url);

    if (!current || candidate.priority > current.priority) {
      existing.set(candidate.url, candidate);
    }
  }
}

export function takeNextCandidates(queue: Map<string, CrawlCandidate>, kind: CrawlCandidateKind, limit: number) {
  const sorted = [...queue.values()]
    .filter((candidate) => candidate.kind === kind)
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit);

  for (const candidate of sorted) {
    queue.delete(candidate.url);
  }

  return sorted;
}
