// ─────────────────────────────────────────────────────────────────────────────
// server/routes/medications.js
// GET    /api/medications           — список лекарств семьи
// POST   /api/medications           — добавить запись
// PUT    /api/medications/:id       — обновить запись
// DELETE /api/medications/:id       — удалить запись
//
// Все запросы требуют familyCode (query для GET/DELETE, body для POST/PUT).
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import {
  getMedications,
  addMedication,
  updateMedication,
  deleteMedication,
} from "../store.js";

const router = Router();

// ── GET /api/medications?familyCode=XXX ───────────────────────────────────────
// Возвращает все записи о лекарствах.
// Query: familyCode (обязательно), limit?, offset?, from?, to?

router.get("/", (req, res) => {
  const { familyCode, limit, offset, from, to } = req.query;

  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode в query." });
  }

  const meds = getMedications(familyCode.trim().toUpperCase());
  if (meds === null) {
    return res.status(404).json({ error: "Семейный круг не найден." });
  }

  // Фильтрация по диапазону дат (опционально)
  let filtered = meds;
  if (from) {
    const fromDate = new Date(from);
    filtered = filtered.filter((m) => new Date(m.dateTime) >= fromDate);
  }
  if (to) {
    const toDate = new Date(to);
    filtered = filtered.filter((m) => new Date(m.dateTime) <= toDate);
  }

  // Пагинация (опционально)
  const total = filtered.length;
  const start = parseInt(offset) || 0;
  const end = limit ? start + parseInt(limit) : undefined;
  const page = end ? filtered.slice(start, end) : filtered;

  res.json({
    total,
    count: page.length,
    medications: page,
  });
});

// ── POST /api/medications ─────────────────────────────────────────────────────
// Добавить запись о приёме лекарства.
//
// Body: {
//   familyCode: string,      — обязательно
//   medicineName: string,    — обязательно
//   dosage?: string,
//   dateTime?: string,       — ISO; по умолчанию текущее время
//   givenBy?: string,
//   comment?: string
// }

router.post("/", (req, res) => {
  const {
    familyCode,
    medicineName,
    dosage,
    dateTime,
    givenBy,
    comment,
  } = req.body || {};

  // Валидация обязательных полей
  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }
  if (!medicineName?.trim()) {
    return res.status(400).json({ error: "Укажите название лекарства (medicineName)." });
  }

  // Валидация dateTime если передан
  if (dateTime && isNaN(Date.parse(dateTime))) {
    return res.status(400).json({ error: "Некорректный формат dateTime. Используйте ISO 8601." });
  }

  const entry = addMedication(familyCode.trim().toUpperCase(), {
    medicineName,
    dosage,
    dateTime: dateTime || new Date().toISOString(),
    givenBy,
    comment,
  });

  if (!entry) {
    return res.status(404).json({ error: "Семейный круг не найден." });
  }

  res.status(201).json(entry);
});

// ── PUT /api/medications/:id ──────────────────────────────────────────────────
// Обновить существующую запись.
//
// Body: {
//   familyCode: string,      — обязательно
//   medicineName?: string,
//   dosage?: string,
//   dateTime?: string,
//   givenBy?: string,
//   comment?: string
// }

router.put("/:id", (req, res) => {
  const { id } = req.params;
  const { familyCode, medicineName, dosage, dateTime, givenBy, comment } = req.body || {};

  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode в теле запроса." });
  }

  // Валидация dateTime если передан
  if (dateTime && isNaN(Date.parse(dateTime))) {
    return res.status(400).json({ error: "Некорректный формат dateTime." });
  }

  const updated = updateMedication(familyCode.trim().toUpperCase(), id, {
    medicineName,
    dosage,
    dateTime,
    givenBy,
    comment,
  });

  if (!updated) {
    return res.status(404).json({ error: "Запись не найдена." });
  }

  res.json(updated);
});

// ── DELETE /api/medications/:id?familyCode=XXX ────────────────────────────────
// Удалить запись.

router.delete("/:id", (req, res) => {
  const { id } = req.params;
  const familyCode = req.query.familyCode || req.body?.familyCode;

  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }

  const ok = deleteMedication(familyCode.trim().toUpperCase(), id);

  if (!ok) {
    return res.status(404).json({ error: "Запись не найдена." });
  }

  res.json({ ok: true, deleted: id });
});

export default router;
