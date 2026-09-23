/** Strip hosts, webhooks, tokens, and env paths from anything shown to technicians. */

const WEBHOOK_RE = /https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\/\S+/gi;
const URL_RE = /https?:\/\/[^\s)\]"'<>]+/gi;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/g;
const BOT_TOKEN_RE = /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/g;
const ENV_PATH_RE = /(?:^|[\s"'=])((?:\/(?:opt|etc|home|root|var|usr)|[A-Za-z]:\\)[^\s"'<>]+)/g;

export function sanitizePublicText(value: unknown, fallback = "Something went wrong on the plant server."): string {
  let text = String(value ?? "").trim();
  if (!text) return fallback;
  text = text.replace(WEBHOOK_RE, "the plant notify channel");
  text = text.replace(BOT_TOKEN_RE, "[redacted]");
  text = text.replace(URL_RE, "the plant server");
  text = text.replace(IPV4_RE, "the plant server");
  text = text.replace(ENV_PATH_RE, " the plant server");
  text = text.replace(/\s+/g, " ").trim();
  return text || fallback;
}

export function looksSensitive(value: string): boolean {
  return (
    /https?:\/\/(?:(?:ptb|canary)\.)?discord(?:app)?\.com\/api\/webhooks\//i.test(value) ||
    /\b\d{8,}:[A-Za-z0-9_-]{20,}\b/.test(value) ||
    /https?:\/\//i.test(value) ||
    /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?\b/.test(value)
  );
}
