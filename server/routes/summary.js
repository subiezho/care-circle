// ─────────────────────────────────────────────────────────────────────────────
// server/routes/summary.js
// GET /api/summary/week?familyCode=XXX&weeks=1
// Возвращает сводку за неделю: лекарства, симптомы, задачи, события.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { getFamily, TYPE_LABELS, checkEscalation } from "../store.js";

const router = Router();

// ── GET /api/summary/week ─────────────────────────────────────────────────────
//
// Query:
//   familyCode — обязательно
//   weeks      — за сколько недель (по умолчанию 1, макс 4)

router.get("/week", (req, res) => {
  const { familyCode, weeks: weeksParam } = req.query;

  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }

  const family = getFamily(familyCode.trim().toUpperCase());
  if (!family) {
    return res.status(404).json({ error: "Семейный круг не найден." });
  }

  const weeks = Math.min(parseInt(weeksParam) || 1, 4);
  const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);

  // ── Симптомы за период ──────────────────────────────────────────────────────

  const symptoms = (family.symptoms || []).filter(
    (s) => new Date(s.createdAt) >= cutoff
  );

  // Подсчёт по типам
  const symptomCounts = {};
  for (const s of symptoms) {
    symptomCounts[s.type] = (symptomCounts[s.type] || 0) + 1;
  }

  // Топ-3 частых симптома
  const topSymptoms = Object.entries(symptomCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => ({ type, label: TYPE_LABELS[type] || type, count }));

  // Кто делал записи
  const recorderCount = {};
  for (const s of symptoms) {
    if (s.memberName) {
      recorderCount[s.memberName] = (recorderCount[s.memberName] || 0) + 1;
    }
  }

  // ── Лекарства за период ─────────────────────────────────────────────────────

  const medications = (family.medications || []).filter(
    (m) => new Date(m.dateTime) >= cutoff
  );

  // Группировка по названию лекарства
  const medGroups = {};
  for (const m of medications) {
    const key = m.medicineName.toLowerCase();
    if (!medGroups[key]) {
      medGroups[key] = { medicineName: m.medicineName, count: 0, givers: new Set() };
    }
    medGroups[key].count++;
    if (m.givenBy) medGroups[key].givers.add(m.givenBy);
  }

  const medicationSummary = Object.values(medGroups).map((g) => ({
    medicineName: g.medicineName,
    count: g.count,
    givers: [...g.givers],
  }));

  // ── Задачи за период ────────────────────────────────────────────────────────

  const allTasks = family.tasks || [];
  const tasksCreated = allTasks.filter((t) => new Date(t.createdAt) >= cutoff);
  const tasksCompleted = allTasks.filter(
    (t) => t.completedAt && new Date(t.completedAt) >= cutoff
  );
  const tasksOverdue = allTasks.filter(
    (t) =>
      t.status !== "done" &&
      t.dueDate &&
      new Date(t.dueDate) < new Date()
  );

  // Кто закрыл больше всего задач (по assignee)
  const assigneeCount = {};
  for (const t of tasksCompleted) {
    if (t.assignee) {
      assigneeCount[t.assignee] = (assigneeCount[t.assignee] || 0) + 1;
    }
  }
  const topContributor = Object.entries(assigneeCount).sort((a, b) => b[1] - a[1])[0];

  // ── Важные события ──────────────────────────────────────────────────────────

  const importantEvents = [];

  // Эскалация
  const escalation = checkEscalation(family.symptoms);
  if (escalation.alert) {
    importantEvents.push({
      type: "escalation",
      severity: "high",
      message: `Тревожные симптомы ${escalation.streak} дней подряд. Рекомендуется визит к врачу.`,
    });
  }

  // Падения за период
  const falls = symptoms.filter((s) => s.type === "fall");
  if (falls.length > 0) {
    importantEvents.push({
      type: "fall",
      severity: "high",
      message: `Зафиксировано падений: ${falls.length}`,
      dates: falls.map((f) => f.createdAt.slice(0, 10)),
    });
  }

  // Спутанность сознания
  const confusion = symptoms.filter((s) => s.type === "confusion");
  if (confusion.length >= 2) {
    importantEvents.push({
      type: "confusion",
      severity: "medium",
      message: `Спутанность сознания отмечена ${confusion.length} раз(а)`,
    });
  }

  // Просроченные задачи
  if (tasksOverdue.length > 0) {
    importantEvents.push({
      type: "overdue_tasks",
      severity: "medium",
      message: `Просроченных задач: ${tasksOverdue.length}`,
      tasks: tasksOverdue.map((t) => ({ title: t.title, assignee: t.assignee, dueDate: t.dueDate })),
    });
  }

  // Нет записей о состоянии более 2 дней
  if (symptoms.length === 0 && weeks === 1) {
    importantEvents.push({
      type: "no_entries",
      severity: "low",
      message: "За эту неделю не было сделано ни одной записи о состоянии.",
    });
  }

  // ── Итоговый ответ ──────────────────────────────────────────────────────────

  res.json({
    familyCode: family.code,
    circleName: family.circleName,
    lovedOneName: family.lovedOneName,
    period: {
      weeks,
      from: cutoff.toISOString(),
      to: new Date().toISOString(),
    },
    symptoms: {
      total: symptoms.length,
      topTypes: topSymptoms,
      recorders: Object.entries(recorderCount)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    },
    medications: {
      total: medications.length,
      summary: medicationSummary,
    },
    tasks: {
      created: tasksCreated.length,
      completed: tasksCompleted.length,
      overdue: tasksOverdue.length,
      topContributor: topContributor
        ? { name: topContributor[0], tasksCompleted: topContributor[1] }
        : null,
    },
    importantEvents,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
