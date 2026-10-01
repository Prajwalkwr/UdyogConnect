/**
 * Minimal server-side client for an OpenAI-compatible chat completions API.
 * The API key is read from the server environment only and is never sent to the browser or logged.
 */
const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 15000;
const FAILURE_COOLDOWN_MS = 60 * 1000;

let cooldownUntil = 0;

const apiKey = () => String(process.env.OPENAI_API_KEY || '').trim();
const model = () => String(process.env.OPENAI_MODEL || '').trim() || DEFAULT_MODEL;
const baseUrl = () => (String(process.env.OPENAI_BASE_URL || '').trim() || DEFAULT_BASE_URL).replace(/\/+$/, '');

const isConfigured = () => Boolean(apiKey());
/** False while unconfigured or cooling down after a failed call, so requests fall back to plain search quickly. */
const isAvailable = () => isConfigured() && Date.now() >= cooldownUntil;

class AiUnavailableError extends Error {
  constructor(message, code = 'AI_UNAVAILABLE') {
    super(message);
    this.code = code;
  }
}

/** Requests a JSON object that matches `schema` (OpenAI structured outputs). */
async function completeJson({ system, user, schema, schemaName = 'udyog_answer', maxTokens = 1200 }) {
  if (!isConfigured()) throw new AiUnavailableError('AI is not configured.', 'AI_NOT_CONFIGURED');
  if (!isAvailable()) throw new AiUnavailableError('AI is cooling down after an error.', 'AI_COOLDOWN');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey()}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: model(),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
        max_completion_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
      throw new AiUnavailableError(`AI provider returned HTTP ${response.status}.`, `HTTP_${response.status}`);
    }
    const data = await response.json();
    const choice = data?.choices?.[0];
    if (choice?.message?.refusal) throw new AiUnavailableError('AI declined the request.', 'AI_REFUSAL');
    const content = choice?.message?.content;
    if (!content) throw new AiUnavailableError('AI returned an empty answer.', 'AI_EMPTY');
    try {
      return JSON.parse(content);
    } catch (_) {
      throw new AiUnavailableError('AI returned invalid JSON.', 'AI_BAD_JSON');
    }
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    cooldownUntil = Date.now() + FAILURE_COOLDOWN_MS;
    throw new AiUnavailableError(err?.name === 'AbortError' ? 'AI request timed out.' : 'AI provider unreachable.', err?.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_UNREACHABLE');
  } finally {
    clearTimeout(timer);
  }
}

function resetAiCooldown() {
  cooldownUntil = 0;
}

module.exports = { completeJson, isConfigured, isAvailable, resetAiCooldown, AiUnavailableError, DEFAULT_MODEL };
