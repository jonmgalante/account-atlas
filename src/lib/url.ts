import ipaddr from "ipaddr.js";

type SafeUrlResult =
  | {
      success: true;
      data: string;
    }
  | {
      success: false;
      error: string;
    };

type NormalizePublicUrlOptions = {
  baseUrl?: string;
  stripTrackingParams?: boolean;
  enforcePublicHostname?: boolean;
};

const BLOCKED_PUBLIC_URL_MESSAGE =
  "Enter a public company URL. Local and private-network targets are blocked.";
const UNSUPPORTED_SCHEME_MESSAGE = "Only http and https URLs are supported.";
const INVALID_URL_MESSAGE = "Enter a valid URL.";
const EMPTY_URL_MESSAGE = "Enter a company URL.";
const CREDENTIALS_URL_MESSAGE = "Credentials are not allowed in the URL.";
const RAW_IP_HOST_MESSAGE = "Enter a company domain, not a raw IP address.";
const UNSUPPORTED_PORT_MESSAGE = "Only standard public web ports are supported.";

const PRIVATE_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];
const TRACKING_QUERY_KEYS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "ref",
  "si",
  "spm",
  "vero_conv",
  "vero_id",
]);

function normalizeTrackingParams(url: URL) {
  const keys = [...url.searchParams.keys()];

  for (const key of keys) {
    const normalizedKey = key.toLowerCase();

    if (normalizedKey.startsWith("utm_") || TRACKING_QUERY_KEYS.has(normalizedKey)) {
      url.searchParams.delete(key);
    }
  }

  if (!url.searchParams.size) {
    url.search = "";
  }
}

function normalizeHttpUrl(rawInput: string, options: NormalizePublicUrlOptions = {}): URL {
  const trimmed = rawInput.trim();

  if (!trimmed) {
    throw new Error(EMPTY_URL_MESSAGE);
  }

  const withProtocol =
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed) || options.baseUrl ? trimmed : `https://${trimmed}`;

  let url: URL;

  try {
    url = options.baseUrl ? new URL(withProtocol, options.baseUrl) : new URL(withProtocol);
  } catch {
    throw new Error(INVALID_URL_MESSAGE);
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(UNSUPPORTED_SCHEME_MESSAGE);
  }

  if (url.username || url.password) {
    throw new Error(CREDENTIALS_URL_MESSAGE);
  }

  const hostname = url.hostname.toLowerCase();
  const normalizedHostname = hostname.replace(/^\[|\]$/g, "");

  if (options.enforcePublicHostname !== false && ipaddr.isValid(normalizedHostname)) {
    throw new Error(RAW_IP_HOST_MESSAGE);
  }

  if (options.enforcePublicHostname !== false && isBlockedHostname(hostname)) {
    throw new Error(BLOCKED_PUBLIC_URL_MESSAGE);
  }

  url.hostname = hostname;
  url.hash = "";

  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  if (url.port) {
    throw new Error(UNSUPPORTED_PORT_MESSAGE);
  }

  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/g, "");
  }

  if (options.stripTrackingParams !== false) {
    normalizeTrackingParams(url);
  }

  return url;
}

export function safeNormalizeCompanyUrl(input: string): SafeUrlResult {
  try {
    return {
      success: true,
      data: normalizeHttpUrl(input, {
        enforcePublicHostname: true,
        stripTrackingParams: true,
      }).toString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : INVALID_URL_MESSAGE,
    };
  }
}

export function normalizeCompanyUrl(input: string) {
  const result = safeNormalizeCompanyUrl(input);

  if (!result.success) {
    throw new Error(result.error);
  }

  return result.data;
}

export function normalizePublicHttpUrl(input: string) {
  return normalizeHttpUrl(input, {
    enforcePublicHostname: true,
    stripTrackingParams: true,
  }).toString();
}

export function normalizeDiscoveredUrl(input: string, baseUrl: string) {
  return normalizeHttpUrl(input, {
    baseUrl,
    enforcePublicHostname: true,
    stripTrackingParams: true,
  }).toString();
}

export function extractCanonicalDomain(input: string) {
  const normalizedUrl = normalizeCompanyUrl(input);
  return normalizeCanonicalDomain(new URL(normalizedUrl).hostname);
}

export function normalizeCanonicalDomain(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  return normalizedHostname.startsWith("www.") ? normalizedHostname.slice(4) : normalizedHostname;
}

export function isCompanyHostname(hostname: string, canonicalDomain: string) {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = normalizeCanonicalDomain(canonicalDomain);

  return normalizedHostname === normalizedDomain || normalizedHostname.endsWith(`.${normalizedDomain}`);
}

export function isBlockedHostname(hostname: string) {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");

  if (normalizedHostname === "localhost" || PRIVATE_HOST_SUFFIXES.some((suffix) => normalizedHostname.endsWith(suffix))) {
    return true;
  }

  if (ipaddr.isValid(normalizedHostname)) {
    return isBlockedIpAddress(normalizedHostname);
  }

  return false;
}

export function isBlockedIpAddress(ipAddress: string) {
  if (!ipaddr.isValid(ipAddress)) {
    return false;
  }

  const parsed = ipaddr.parse(ipAddress);
  const range = parsed.range();

  return [
    "unspecified",
    "broadcast",
    "multicast",
    "loopback",
    "private",
    "linkLocal",
    "carrierGradeNat",
    "reserved",
    "uniqueLocal",
    "ipv4Mapped",
    "rfc6145",
    "rfc6052",
  ].includes(range);
}

export {
  BLOCKED_PUBLIC_URL_MESSAGE,
  CREDENTIALS_URL_MESSAGE,
  EMPTY_URL_MESSAGE,
  INVALID_URL_MESSAGE,
  RAW_IP_HOST_MESSAGE,
  UNSUPPORTED_SCHEME_MESSAGE,
  UNSUPPORTED_PORT_MESSAGE,
};
