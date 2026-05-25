// ─────────────────────────────────────────────────────────────────────────────
// server/routes/search.js
// GET /api/search?q=...&familyCode=XXX&type=all
// Поиск по задачам, симптомам, лекарствам и комментариям.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { getFamily, TYPE_LABELS } from "../store.js";

const router = Router();

// ── GET /api/search ───────────────────────────────────────────────────────────
//
// Query:
//   q          — поисковый запрос (обязательно, мин. 2 символа)
//   familyCode — код семьи (обязательно)
//   type       — фильтр: all | tasks | symptoms | medications (по умолчанию all)
//   limit      — максимум результатов (по умолчанию 50)

router.get("/", (req, res) => {
  const { q, familyCode, type = "all", limit: limitParam } = req.query;

  // Валидация
  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }
  if (!q?.trim()) {
    return res.status(400).json({ error: "Укажите поисковый запрос (q)." });
  }
  if (q.trim().length < 2) {
    return res.status(400).json({ error: "Запрос должен содержать минимум 2 символа." });
  }

  const family = getFamily(familyCode.trim().toUpperCase());
  if (!family) {
    return res.status(404).json({ error: "Семейный круг не найден." });
  }

  const query = q.trim().toLowerCase();
  const limit = Math.min(parseInt(limitParam) || 50, 200);
  const results = [];

  // ── Поиск по задачам ────────────────────────────────────────────────────────

  if (type === "all" || type === "tasks") {
    for (const task of family.tasks || []) {
      const matched =
        matchText(task.title, query) ||
        matchText(task.assignee, query) ||
        matchText(task.createdBy, query);

      if (matched) {
        results.push({
          kind: "task",
          id: task.id,
          title: task.title,
          assignee: task.assignee || null,
          status: task.status,
          dueDate: task.dueDate || null,
          createdAt: task.createdAt,
          highlight: buildHighlight(task.title, query),
        });
      }
    }
  }

  // ── Поиск по симптомам / дневнику ───────────────────────────────────────────

  if (type === "all" || type === "symptoms") {
    for (const s of family.symptoms || []) {
      const typeLabel = TYPE_LABELS[s.type] || s.type;
      const matched =
        matchText(s.note, query) ||
        matchText(typeLabel, query) ||
        matchText(s.memberName, query);

      if (matched) {
        results.push({
          kind: "symptom",
          id: s.id,
          type: s.type,
          typeLabel,
          note: s.note || null,
          memberName: s.memberName || null,
          createdAt: s.createdAt,
          highlight: buildHighlight(s.note || typeLabel, query),
        });
      }
    }
  }

  // ── Поиск по лекарствам ─────────────────────────────────────────────────────

  if (type === "all" || type === "medications") {
    for (const m of family.medications || []) {
      const matched =
        matchText(m.medicineName, query) ||
        matchText(m.dosage, query) ||
        matchText(m.givenBy, query) ||
        matchText(m.comment, query);

      if (matched) {
        results.push({
          kind: "medication",
          id: m.id,
          medicineName: m.medicineName,
          dosage: m.dosage || null,
          givenBy: m.givenBy || null,
          comment: m.comment || null,
          dateTime: m.dateTime,
          highlight: buildHighlight(m.medicineName + " " + (m.comment || ""), query),
        });
      }
    }
  }

  // Сортируем по дате (новые первые) и обрезаем
  results.sort((a, b) => {
    const dateA = new Date(a.createdAt || a.dateTime || 0);
    const dateB = new Date(b.createdAt || b.dateTime || 0);
    return dateB - dateA;
  });

  const paginated = results.slice(0, limit);

  res.json({
    query: q.trim(),
    total: results.length,
    count: paginated.length,
    results: paginated,
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Проверяет содержит ли строка запрос (case-insensitive).
 */
function matchText(text, query) {
  if (!text) return false;
  return text.toLowerCase().includes(query);
}

/**
 * Возвращает фрагмент текста с подсвеченным совпадением.
 * Первые 150 символов вокруг первого вхождения.
 */
function buildHighlight(text, query) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text.slice(0, 100);

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 60);
  const fragment = text.slice(start, end);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + fragment + suffix;
}

export default router;
