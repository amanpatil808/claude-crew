// Redaction runs before anything reaches disk or the page: raw tool output and container logs
// can carry tokens, cookies, DB passwords and customer details (phones, OTPs, emails, addresses).
// Rules are ordered: structured secrets first, so later broad rules never see half-masked text.

type Rule = [RegExp, string];

const R = "[redacted]";

// JSON keys whose value is always private, whatever it looks like.
const SECRET_KEY = "(?:[a-z0-9_]*(?:password|passwd|secret|token|cookie|session|authorization|api_?key|private_?key|refresh|credential)[a-z0-9_]*)";
const ADDRESS_KEY = "(?:address(?:_?line_?\\d?)?|street|landmark|locality|flat(?:_?no)?|house(?:_?no)?|building|area|pincode|pin_?code|postal_?code|zip|lat|lng|latitude|longitude)";
const OTP_KEY = "(?:otp|otp_?code|verification_?code|pin)";


const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1 && (d *= 2) > 9) d -= 9;
    sum += d;
  }
  return sum % 10 === 0;
};

// Phone or card number written with any separators ("987 654 3210", "98765.43210", "4111-1111-1111-1111"):
// strip the separators, then judge the digits. A run that is neither (dates, counts) is left alone, and a
// letter or digit before or after the run means it is part of an id.
const NUMBER_RUN = /(?<![\w+])\+?\d[\d\s.-]{7,24}\d(?!\w)/g;
function maskNumbers(text: string): string {
  return text.replace(NUMBER_RUN, (run) => {
    const parts = run.match(/\d+|\D+/g) ?? [];
    // Longest window of digit groups first, so "on 2026-10-22 call 9876543210" still finds the phone.
    for (let len = parts.length; len >= 1; len--) {
      for (let i = 0; i + len <= parts.length; i++) {
        const win = parts.slice(i, i + len);
        if (!/^\d/.test(win[0]) || !/\d$/.test(win[len - 1])) continue;
        const digits = win.join("").replace(/\D/g, "");
        const kind = /^(?:91|0)?[6-9]\d{9}$/.test(digits) ? "[phone]" : digits.length >= 13 && digits.length <= 19 && luhn(digits) ? "[card]" : "";
        if (kind) return parts.slice(0, i).join("") + kind + parts.slice(i + len).join("");
      }
    }
    return run;
  });
}

const RULES: Rule[] = [
  // postgres://user:pass@host, redis://:pass@host: keep scheme and user, drop the password.
  [/\b([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]*):([^\s@/]+)@/gi, `$1$2:${R}@`],
  // "password": "...", "addressLine1": "..." and friends in JSON logs.
  [new RegExp(`("${SECRET_KEY}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,}\\s]+)`, "gi"), `$1"${R}"`],
  [new RegExp(`("${ADDRESS_KEY}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|-?\\d+(?:\\.\\d+)?)`, "gi"), `$1"${R}"`],
  [new RegExp(`("${OTP_KEY}"\\s*:\\s*)("?\\d{4,8}"?)`, "gi"), `$1"${R}"`],
  // REDIS_PASSWORD=..., POSTGRES_PASSWORD: ..., api_key=... in env dumps and plain-text logs.
  [/\b([A-Za-z0-9_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|COOKIE|SESSION_?ID)[A-Za-z0-9_]*)(\s*[=:]\s*)("?)[^\s"',;&]+/gi, `$1$2$3${R}`],
  [/\b(address|pincode)(\s*[=:]\s*)("[^"]*"|[^\n,;]+)/gi, `$1$2${R}`],
  // HTTP auth and cookie headers.
  [/\b(Set-Cookie|Cookie)(\s*:\s*)[^\r\n]+/gi, `$1$2${R}`],
  [/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${R}`],
  // Well-known token shapes (GitHub, Anthropic, Slack, AWS, Docker Hub, GitLab) and JWTs.
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|dckr_pat_[A-Za-z0-9_-]{10,}|glpat-[A-Za-z0-9_-]{10,})/g, "[token]"],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, "[token]"],
  // OTPs written in prose: keep the label, drop the digits.
  [/\b(otp|one[- ]time (?:password|code)|verification code|login code)\b([^0-9\n]{0,20})\d{4,8}\b/gi, `$1$2${R}`],
  [/\b(\d{4,8})(\s+is your\b[^\n]{0,40}\b(?:otp|code))/gi, `${R}$2`],
  // "your code: 482913", "login pin is 1234": a code word, then is/:/=, then 4-8 digits.
  [/\b((?:code|pin|passcode)\s*(?:is|:|=)\s*)\d{4,8}\b/gi, `$1${R}`],
  // "the password is hunter2": the word after the label goes, whatever it looks like.
  [/\b(password|passwd|passphrase|passcode|pwd)(\s+(?:is|was)\s+|\s*=\s*)(?!\[redacted\])[^\s,;]+/gi, `$1$2${R}`],
  // Postal addresses in prose: "Flat 4B, 12 MG Road, Indiranagar, Bengaluru 560038" and "pincode 560038".
  [/\b(?:flat|house|plot|door|apt|apartment|room)\b\.?\s*(?:no\.?\s*)?#?[\w/-]+\s*,[^\n]{0,120}?\b[1-9]\d{2}\s?\d{3}\b/gi, "[address]"],
  [/\b(?:flat|house|plot|door|apt|apartment|room)\b\.?\s*(?:no\.?\s*)?#?[\w/-]+\s*,[^\n,]+,[^\n,]+/gi, "[address]"],
  [/\b((?:pin\s?code|pin|zip|postal code)\s*[:#-]?\s*)[1-9]\d{2}\s?\d{3}\b/gi, `$1${R}`],
  [/(,\s*[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?\s+)[1-9]\d{2}\s?\d{3}\b/g, `$1${R}`],
  // Emails before phones, so the digits in an address are not half-matched.
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, "[email]"],
  // UPI ids (name@okhdfc, 9876543210@ybl): an "@" and a bank or app handle, no dot, so ssh "user@host" is untouched.
  [/[A-Za-z0-9._-]+@(?:ok[a-z]+|[a-z]*(?:bank|upi|pay|ybl|ibl|axl|apl|icici|hdfc|sbi|axis|pnb|paytm|kotak|rbl|idfc|fbl)[a-z]*)\b(?!\.)/gi, "[upi]"],
  // Indian mobiles (+91 98765 43210, 9876543210) and other +CC numbers. The number must stand alone:
  // a letter or digit on either side means it is part of an id (agent id "aac46ee8410611592"), not a phone.
  [/(?<![\w+])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\w)/g, "[phone]"],
  [/(?<![\w+])\+\d{1,3}[\s-]?\d{3,5}[\s-]?\d{3,5}[\s-]?\d{0,5}(?!\d)/g, "[phone]"],
  // Long mixed-case random strings (unknown token formats). Pure hex is left alone so git SHAs survive,
  // and "/" is not part of a match so URL paths (github.com/owner/repo/...) stay readable.
  [/\b(?=[A-Za-z0-9_+-]*[A-Z])(?=[A-Za-z0-9_+-]*[a-z])(?=[A-Za-z0-9_+-]*\d)[A-Za-z0-9_+-]{32,}={0,2}/g, "[secret]"],
];

const SENSITIVE_PROP = new RegExp(`^(?:${SECRET_KEY}|${ADDRESS_KEY}|${OTP_KEY}|phone|mobile|email)$`, "i");

export function redact(text: string): string {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  return maskNumbers(out);
}

// Walks parsed JSON: values under sensitive keys are dropped whole, every other string is redacted.
export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return redact(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_PROP.test(k) && v != null ? R : redactDeep(v);
    return out as T;
  }
  return value;
}
