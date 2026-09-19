const PATTERN_SCAN_MAX_CHARS = 256 * 1024;
const MIN_SUBSTANTIVE_TEXT_CHARS = 40;

function headerValue(headers, name) {
  if (headers instanceof Headers) return headers.get(name) || '';
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers || {})) {
    if (key.toLowerCase() === target) return Array.isArray(value) ? value.join(', ') : String(value ?? '');
  }
  return '';
}

function bodyString(body) {
  if (body == null) return '';
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return String(body);
}

function bodyByteLength(body, converted) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return body.byteLength;
  return Buffer.byteLength(converted);
}

function visibleText(html) {
  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i);
  return (bodyMatch?.[1] ?? html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<!--[^]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scanWallSignals(sample) {
  // These patterns intentionally require bounded, multi-word phrases or a
  // title/heading context. A bare number (including 404), "login", or
  // "cookies" is not evidence that the retrieved resource is a wall.
  const challenge = /(?:<\s*(?:title|h1)[^>]*>[^<]{0,80}(?:just a moment|attention required|security check)|\b(?:verify (?:that )?you are human|complete the security check|checking your browser)\b)/i.test(sample);
  const login = /(?:<\s*(?:title|h1)[^>]*>[^<]{0,80}(?:sign in required|login required)|\b(?:please )?(?:sign in|log in) to continue\b)/i.test(sample);
  const consent = /(?:<\s*(?:title|h1)[^>]*>[^<]{0,80}before you continue|\b(?:accept|manage) (?:our )?(?:cookies|consent) to continue\b)/i.test(sample);
  const soft404 = /<\s*(?:title|h1)[^>]*>\s*(?:(?:error\s*)?404(?:\s|<|[-:])|page (?:not found|does not exist)|not found\s*(?:<|$))/i.test(sample)
    || /\b(?:the page|page you (?:requested|are looking for)) (?:does not exist|could not be found|is no longer available)\b/i.test(sample);
  return { challenge, login, consent, soft404 };
}

/**
 * Conservatively classify whether a response is usable by the HTML page
 * evaluator. This does not classify sitemap documents or prove that a page is
 * indexable. Wall/soft-404 heuristics only scan the first 256 Ki characters and
 * result in `indeterminate`, never a claim that the page is definitively absent.
 */
export function classifyResource({
  status,
  headers = {},
  body,
  bodyComplete = true,
  requestedUrl = null,
  effectiveUrl = null,
} = {}) {
  const rawBody = bodyString(body);
  const contentTypeHeader = headerValue(headers, 'content-type');
  const contentType = contentTypeHeader.split(';', 1)[0].trim().toLowerCase() || null;
  const sample = rawBody.slice(0, PATTERN_SCAN_MAX_CHARS);
  const walls = scanWallSignals(sample);
  const text = visibleText(sample);
  const signals = {
    http_status: Number.isInteger(status) ? status : null,
    content_type: contentType,
    html_mime: contentType === 'text/html' || contentType === 'application/xhtml+xml',
    body_complete: bodyComplete === true,
    body_bytes: bodyByteLength(body, rawBody),
    substantive_text_chars: text.length,
    pattern_scan_max_chars: PATTERN_SCAN_MAX_CHARS,
    pattern_scan_truncated: rawBody.length > PATTERN_SCAN_MAX_CHARS,
    challenge_wall: walls.challenge,
    login_wall: walls.login,
    consent_wall: walls.consent,
    soft_404: walls.soft404,
    requested_url: requestedUrl ?? null,
    effective_url: effectiveUrl ?? null,
  };

  if (!Number.isInteger(status)) return { state: 'indeterminate', reason_codes: ['http_status_missing'], signals };
  if (status < 200 || status >= 400) return { state: 'invalid_resource', reason_codes: [`http_status_${status}`], signals };
  if (status >= 300) return { state: 'indeterminate', reason_codes: ['redirect_response'], signals };
  if (bodyComplete !== true) return { state: 'indeterminate', reason_codes: ['body_truncated'], signals };
  if (contentType && !signals.html_mime) return { state: 'invalid_resource', reason_codes: ['unexpected_mime'], signals };
  if (!rawBody.trim()) return { state: 'indeterminate', reason_codes: ['empty_body'], signals };
  if (!contentType) return { state: 'indeterminate', reason_codes: ['content_type_missing'], signals };

  const wallReasons = [];
  if (walls.challenge) wallReasons.push('challenge_wall_signal');
  if (walls.login) wallReasons.push('login_wall_signal');
  if (walls.consent) wallReasons.push('consent_wall_signal');
  if (walls.soft404) wallReasons.push('soft_404_signal');
  if (wallReasons.length) return { state: 'indeterminate', reason_codes: wallReasons, signals };
  if (text.length < MIN_SUBSTANTIVE_TEXT_CHARS) {
    return { state: 'indeterminate', reason_codes: ['insubstantial_html'], signals };
  }
  return { state: 'valid_resource', reason_codes: ['substantive_html'], signals };
}

export const RESOURCE_VALIDITY_LIMITS = Object.freeze({
  pattern_scan_max_chars: PATTERN_SCAN_MAX_CHARS,
  minimum_substantive_text_chars: MIN_SUBSTANTIVE_TEXT_CHARS,
});
