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

export function parseHtmlDocument(input: {
  html: string;
  finalUrl: string;
  canonicalDomain: string;
}): ParsedHtmlDocument {
  const $ = load(input.html);
  const dom = new JSDOM(input.html, {
    url: input.finalUrl,
  });

  try {
    const readability = new Readability(dom.window.document);
    const article = readability.parse();
    const contentHtml = article?.content ?? $("main").html() ?? $("body").html() ?? "";
    const markdownContent = normalizeMarkdown(contentHtml ? turndownService.turndown(contentHtml) : null);
    const textContent = normalizeText(article?.textContent ?? $("body").text());
    const title =
      article?.title?.trim() || $("meta[property='og:title']").attr("content")?.trim() || $("title").text().trim() || null;

    const links = $("a[href]")
      .map((_, element) => ({
        url: $(element).attr("href") ?? "",
        anchorText: normalizeText($(element).text()),
      }))
      .get()
      .filter((link) => link.url);

    return {
      title,
      canonicalUrl: extractCanonicalUrl($, input.finalUrl, input.canonicalDomain),
      markdownContent,
      textContent,
      links,
      ...extractDateHints($),
    };
  } finally {
    dom.window.close();
  }
}
