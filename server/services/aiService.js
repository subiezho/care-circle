// ─────────────────────────────────────────────────────────────────────────────
// server/services/aiService.js
// Единая обёртка над Anthropic API.
// Используется всеми AI-маршрутами — логика вызова в одном месте.
// ─────────────────────────────────────────────────────────────────────────────

import { AI_CONFIG } from "../config/aiPrompts.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * Проверяет наличие API-ключа.
 * @returns {{ ok: boolean, error?: string }}
 */
export function checkApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error:
        "ANTHROPIC_API_KEY не задан. Добавьте его в файл .env и перезапустите сервер.",
    };
  }
  return { ok: true };
}

/**
 * Вызывает Claude API.
 *
 * @param {string} systemPrompt — системный промпт
 * @param {Array<{role: string, content: string}>} messages — история сообщений
 * @param {number} [maxTokens] — переопределение лимита токенов
 * @returns {Promise<string>} — текст ответа модели
 * @throws {Error} — при ошибке сети или API
 */
export async function callClaude(systemPrompt, messages, maxTokens = AI_CONFIG.maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;

  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: AI_CONFIG.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    const msg = data?.error?.message || `Anthropic API error ${response.status}`;
    throw new Error(msg);
  }

  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Пустой ответ от модели.");

  return text;
}

/**
 * Обрезает историю до максимального числа сообщений (последние N).
 * @param {Array} history
 * @param {number} [max]
 * @returns {Array}
 */
export function trimHistory(history, max = AI_CONFIG.maxHistoryMessages) {
  if (!Array.isArray(history)) return [];
  return history.slice(-max).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || ""),
  }));
}
