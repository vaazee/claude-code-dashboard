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

// A name that suggests its value is secret: api_key, api-key, x-auth-token, GITHUB_TOKEN, ...
// "author" and "tokens" in ordinary prose are deliberately not matched.
const SECRET_NAME =
  '[A-Za-z0-9_-]*(?:TOKEN(?!S\\b)|SECRET|PASSWORD|PASSWD|API[_-]?KEY|APIKEY|AUTH(?:ORIZATION)?(?![A-Z])|CREDENTIAL|PRIVATE[_-]?KEY)[A-Za-z0-9_-]*';

export function redactString(s: string): string {
  let out = s;
  for (const re of SECRET_VALUE) out = out.replace(re, MASK);
  // Authorization: Bearer <token>. Runs before the key: value rule, which would only mask the word "Bearer".
  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, `$1 ${MASK}`);
  // user:password@host in URLs
  out = out.replace(/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):([^\s@/]+)@/gi, `$1:${MASK}@`);
  // KEY=value, key: value and ?api_key=value forms (env lines, scripts, CLI args, query strings)
  out = out.replace(
    new RegExp(`\\b(${SECRET_NAME})(\\s*[=:]\\s*)("?)([^\\s"',}&#]+)`, 'gi'),
    (_m, k, sep, q) => `${k}${sep}${q}${MASK}`,
  );
  // --token value / -api-key value: a secret-named flag followed by its value as a separate argument
  out = out.replace(new RegExp(`(^|\\s)(--?${SECRET_NAME})(\\s+)(?!-)(\\S+)`, 'gi'), (_m, pre, flag, sp) => `${pre}${flag}${sp}${MASK}`);
  return out;
}

/** Mask every query value and any password in a URL; endpoints often carry keys as ?key=... */
export function redactUrl(u: string): string {
  try {
    const url = new URL(u);
    if (url.password) url.password = MASK;
    for (const k of [...url.searchParams.keys()]) url.searchParams.set(k, MASK);
    return decodeURI(url.toString());
  } catch {
    return redactString(u);
  }
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
