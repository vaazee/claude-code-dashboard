// Mask secrets before anything leaves the server. Applied to every config-ish payload.

const SECRET_KEY = /(token|secret|password|passwd|api[-_]?key|apikey|auth|cookie|credential|private[-_]?key|bearer)/i;
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9_-]{16,}/g, // Anthropic / OpenAI style keys
  /\b(gh[pousr]_[A-Za-z0-9]{20,})/g, // GitHub tokens
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\b[A-Fa-f0-9]{40,}\b/g, // long hex blobs
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWTs
];

export const MASK = '••••••••';

export function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, MASK);
  // KEY=value and "key": "value" forms inside free text (env lines, shell scripts, CLI args)
  out = out.replace(
    /\b([A-Za-z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_?KEY|AUTH)[A-Za-z0-9_]*)(\s*[=:]\s*)("?)([^\s"',}]+)/gi,
    (_m, k, sep, q) => `${k}${sep}${q}${MASK}`,
  );
  return out;
}

export function redact<T>(value: T, keyHint = ''): T {
  if (value == null) return value;
  if (typeof value === 'string') {
    return (SECRET_KEY.test(keyHint) && value.length > 0 ? MASK : redactString(value)) as T;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, keyHint)) as T;
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Whole env blocks are almost always secrets or machine-specific; keep keys, hide values.
      if (k === 'env' && v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = Object.fromEntries(Object.keys(v).map((ek) => [ek, MASK]));
      } else if (SECRET_KEY.test(k) && (typeof v === 'string' || typeof v === 'number')) {
        out[k] = MASK;
      } else {
        out[k] = redact(v, k);
      }
    }
    return out as T;
  }
  return value;
}
