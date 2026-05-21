const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CREDIT_CARD_RE = /\b(?:\d[ -]*?){13,16}\b/g;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL_RE, "[EMAIL_REDACTED]")
    .replace(PHONE_RE, "[PHONE_REDACTED]")
    .replace(SSN_RE, "[SSN_REDACTED]")
    .replace(CREDIT_CARD_RE, "[CARD_REDACTED]");
}

export function truncatePreview(text: string, maxChars: number): string {
  const cleaned = redactPii(text).trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}…`;
}
