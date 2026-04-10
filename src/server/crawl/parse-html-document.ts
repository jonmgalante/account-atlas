import "server-only";

import { Readability } from "@mozilla/readability";
import { load } from "cheerio";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

import { isCompanyHostname, normalizeDiscoveredUrl } from "@/lib/url";
import type { ParsedHtmlDocument } from "@/server/crawl/types";

const turndownService = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

function coerceDate(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function normalizeText(text: string | null | undefined) {
  if (!text) {
    return null;
  }

  const normalized = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return normalized || null;
}

function normalizeMarkdown(markdown: string | null | undefined) {
  if (!markdown) {
    return null;
  }

  const normalized = markdown
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return normalized || null;
}

function extractCanonicalUrl($: ReturnType<typeof load>, finalUrl: string, canonicalDomain: string) {
  const href = $("link[rel='canonical']").attr("href");

  if (!href) {
    return finalUrl;
  }

  try {
    const normalized = normalizeDiscoveredUrl(href, finalUrl);

    if (isCompanyHostname(new URL(normalized).hostname, canonicalDomain)) {
      return normalized;
    }
  } catch {
    return finalUrl;
  }

  return finalUrl;
}

function extractDateHints($: ReturnType<typeof load>) {
  const publishedCandidates = [
    $("meta[property='article:published_time']").attr("content"),
    $("meta[name='publish-date']").attr("content"),
    $("meta[name='pubdate']").attr("content"),
    $("time[datetime]").first().attr("datetime"),
  ];

  const updatedCandidates = [
    $("meta[property='article:modified_time']").attr("content"),
    $("meta[property='og:updated_time']").attr("content"),
    $("meta[name='last-modified']").attr("content"),
    $("meta[http-equiv='last-modified']").attr("content"),
  ];

  return {
    publishedAt: publishedCandidates.map(coerceDate).find(Boolean) ?? null,
    updatedAtHint: updatedCandidates.map(coerceDate).find(Boolean) ?? null,
  };
}

function extractLinks($: ReturnType<typeof load>) {
  return $("a[href]")
    .map((_, element) => ({
      url: $(element).attr("href") ?? "",
      anchorText: normalizeText($(element).text()),
    }))
    .get()
    .filter((link) => link.url);
}

function buildFallbackDocument($: ReturnType<typeof load>, input: { html: string; finalUrl: string; canonicalDomain: string }) {
  const contentHtml = $("main").html() ?? $("body").html() ?? input.html;
  let markdownContent: string | null = null;

  try {
    markdownContent = normalizeMarkdown(contentHtml ? turndownService.turndown(contentHtml) : null);
  } catch {
    markdownContent = normalizeText($("body").text()) ?? null;
  }

  return {
    title:
      $("meta[property='og:title']").attr("content")?.trim() ||
      $("title").text().trim() ||
      new URL(input.finalUrl).hostname,
    canonicalUrl: extractCanonicalUrl($, input.finalUrl, input.canonicalDomain),
    markdownContent,
    textContent: normalizeText($("body").text()),
    parsingStrategy: "fallback" as const,
    links: extractLinks($),
    ...extractDateHints($),
  };
}

export function parseHtmlDocument(input: {
  html: string;
  finalUrl: string;
  canonicalDomain: string;
}): ParsedHtmlDocument {
  const $ = load(input.html);
  let dom: JSDOM | null = null;

  try {
    dom = new JSDOM(input.html, {
      url: input.finalUrl,
    });

    let article: ReturnType<Readability["parse"]> | null = null;

    try {
      const readability = new Readability(dom.window.document);
      article = readability.parse();
    } catch {
      return buildFallbackDocument($, input);
    }

    const contentHtml = article?.content ?? $("main").html() ?? $("body").html() ?? "";
    let markdownContent: string | null = null;

    try {
      markdownContent = normalizeMarkdown(contentHtml ? turndownService.turndown(contentHtml) : null);
    } catch {
      return buildFallbackDocument($, input);
    }

    const textContent = normalizeText(article?.textContent ?? $("body").text());
    const title =
      article?.title?.trim() || $("meta[property='og:title']").attr("content")?.trim() || $("title").text().trim() || null;

    return {
      title,
      canonicalUrl: extractCanonicalUrl($, input.finalUrl, input.canonicalDomain),
      markdownContent,
      textContent,
      parsingStrategy: "full",
      links: extractLinks($),
      ...extractDateHints($),
    };
  } catch {
    return buildFallbackDocument($, input);
  } finally {
    dom?.window.close();
  }
}
