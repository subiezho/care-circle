// ─────────────────────────────────────────────────────────────────────────────
// server/routes/ai.js
// POST /api/ai/question      — вопрос по данным семьи
// POST /api/ai/communication — совет по сложному разговору
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { getFamily, buildAIContext } from "../store.js";
import { callClaude, checkApiKey, trimHistory } from "../services/aiService.js";
import {
  QUESTION_SYSTEM,
  COMMUNICATION_SYSTEM,
  COMMUNICATION_SCENARIOS,
} from "../config/aiPrompts.js";

const router = Router();

// ── POST /api/ai/question ─────────────────────────────────────────────────────
//
// Отвечает на вопрос пользователя строго по данным семьи.
//
// Body: {
//   familyCode: string,      — обязательно
//   question: string,        — обязательно
//   history?: Array<{role, content}>  — история диалога (опционально)
// }
//
// Response: { answer: string }

router.post("/question", async (req, res) => {
  const { familyCode, question, history = [] } = req.body || {};

  // Валидация
  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }
  if (!question?.trim()) {
    return res.status(400).json({ error: "Вопрос не может быть пустым." });
  }

  // Загружаем данные семьи
  const family = getFamily(familyCode);
  if (!family) {
    return res.status(404).json({ error: "Семейный круг не найден. Проверьте код." });
  }

  const hasAnyHistory =
    (family.symptoms && family.symptoms.length > 0) ||
    (family.tasks && family.tasks.length > 0) ||
    (family.medications && family.medications.length > 0);

  if (!hasAnyHistory) {
    return res.json({ answer: "В истории пока нет информации по этому вопросу." });
  }

  // Ключ нужен только если есть реальные данные для анализа
  const keyCheck = checkApiKey();
  if (!keyCheck.ok) {
    return res.status(503).json({ error: keyCheck.error });
  }

  // Строим контекст из реальных данных
  const familyContext = buildAIContext(family);

  // Системный промпт = инструкции + данные семьи
  const systemPrompt = `${QUESTION_SYSTEM}\n\n${familyContext}`;

  // Сообщения: история + новый вопрос
  const messages = [
    ...trimHistory(history),
    { role: "user", content: question.trim() },
  ];

  try {
    const answer = await callClaude(systemPrompt, messages);
    res.json({ answer });
  } catch (err) {
    console.error("[AI /question]", err.message);
    res.status(500).json({ error: `Ошибка ИИ: ${err.message}` });
  }
});

// ── POST /api/ai/communication ────────────────────────────────────────────────
//
// Советует как провести сложный разговор.
// Контекст семьи НЕ передаётся — ответы универсальные.
//
// Body: {
//   scenarioId?: string,    — id из COMMUNICATION_SCENARIOS (если выбран)
//   userMessage: string,    — свой вопрос или уточнение
//   history?: Array<{role, content}>
// }
//
// Response: { advice: string, scenario?: object }

router.post("/communication", async (req, res) => {
  const { scenarioId, userMessage, history = [] } = req.body || {};

  if (!userMessage?.trim() && !scenarioId) {
    return res.status(400).json({ error: "Укажите scenarioId или userMessage." });
  }

  const keyCheck = checkApiKey();
  if (!keyCheck.ok) {
    return res.status(503).json({ error: keyCheck.error });
  }

  // Находим шаблонный сценарий (если передан)
  const scenario = scenarioId ? COMMUNICATION_SCENARIOS[scenarioId] : null;

  // Строим финальный запрос пользователя
  let userContent = "";
  if (scenario && scenario.promptAddition) {
    userContent += `Контекст ситуации: ${scenario.promptAddition}\n\n`;
  }
  if (userMessage?.trim()) {
    userContent += userMessage.trim();
  } else if (scenario) {
    userContent += `Помоги справиться с ситуацией: ${scenario.title}`;
  }

  const messages = [
    ...trimHistory(history),
    { role: "user", content: userContent },
  ];

  try {
    const advice = await callClaude(COMMUNICATION_SYSTEM, messages);
    res.json({
      advice,
      scenario: scenario
        ? { id: scenario.id, title: scenario.title, description: scenario.description }
        : null,
    });
  } catch (err) {
    console.error("[AI /communication]", err.message);
    res.status(500).json({ error: `Ошибка ИИ: ${err.message}` });
  }
});

// ── GET /api/ai/scenarios ─────────────────────────────────────────────────────
// Возвращает список готовых сценариев коммуникации (без promptAddition).

router.get("/scenarios", (_req, res) => {
  const list = Object.values(COMMUNICATION_SCENARIOS).map(({ id, title, description }) => ({
    id,
    title,
    description,
  }));
  res.json(list);
});

export default router;
