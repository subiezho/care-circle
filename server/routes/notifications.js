// ─────────────────────────────────────────────────────────────────────────────
// server/routes/notifications.js
// GET /api/notifications?familyCode=XXX
// Серверная логика уведомлений: просроченные задачи, пропущенные записи, эскалация.
// ─────────────────────────────────────────────────────────────────────────────

import { Router } from "express";
import { getFamily, checkEscalation } from "../store.js";
import { NOTIFICATION_MESSAGES } from "../config/aiPrompts.js";

const router = Router();

// Пороги (часы)
const HEALTH_ENTRY_WARN_HOURS = 24;   // нет записей о состоянии
const MEDICATION_WARN_HOURS   = 24;   // нет записей о лекарствах (если были раньше)

// ── GET /api/notifications?familyCode=XXX ────────────────────────────────────
//
// Возвращает список активных уведомлений для семьи.
//
// Response: {
//   familyCode, total,
//   notifications: Array<{
//     id, type, severity, title, message, data?, createdAt
//   }>
// }

router.get("/", (req, res) => {
  const { familyCode } = req.query;

  if (!familyCode?.trim()) {
    return res.status(400).json({ error: "Укажите familyCode." });
  }

  const family = getFamily(familyCode.trim().toUpperCase());
  if (!family) {
    return res.status(404).json({ error: "Семейный круг не найден." });
  }

  const notifications = [];
  const now = new Date();

  // ── 1. Просроченные задачи ──────────────────────────────────────────────────

  const overdueTasks = (family.tasks || []).filter(
    (t) => t.status !== "done" && t.dueDate && new Date(t.dueDate) < now
  );

  for (const task of overdueTasks) {
    const daysOverdue = Math.floor(
      (now - new Date(task.dueDate)) / (1000 * 60 * 60 * 24)
    );
    notifications.push({
      id: `overdue-task-${task.id}`,
      type: "overdue_task",
      severity: daysOverdue >= 3 ? "high" : "medium",
      title: "Просроченная задача",
      message: NOTIFICATION_MESSAGES.overdue_task(task.title, task.assignee, daysOverdue),
      data: {
        taskId: task.id,
        taskTitle: task.title,
        assignee: task.assignee || null,
        dueDate: task.dueDate,
        daysOverdue,
      },
      createdAt: now.toISOString(),
    });
  }

  // ── 2. Нет записей о состоянии ──────────────────────────────────────────────

  const symptoms = family.symptoms || [];
  const lastSymptom = symptoms[0]; // sorted newest first
  const hoursSinceHealth = lastSymptom
    ? (now - new Date(lastSymptom.createdAt)) / (1000 * 60 * 60)
    : null;

  // Если семья существует > 1 дня, но нет записей — предупреждаем
  const familyAgeHours = (now - new Date(family.createdAt)) / (1000 * 60 * 60);

  if (familyAgeHours > HEALTH_ENTRY_WARN_HOURS) {
    const hoursGap = hoursSinceHealth !== null
      ? Math.floor(hoursSinceHealth)
      : Math.floor(familyAgeHours);

    if (hoursGap >= HEALTH_ENTRY_WARN_HOURS) {
      notifications.push({
        id: "no-health-entry",
        type: "no_health_entry",
        severity: hoursGap >= 48 ? "high" : "medium",
        title: "Нет записей о состоянии",
        message: NOTIFICATION_MESSAGES.no_health_entry(hoursGap),
        data: {
          lastEntryAt: lastSymptom?.createdAt || null,
          hoursWithoutEntry: hoursGap,
        },
        createdAt: now.toISOString(),
      });
    }
  }

  // ── 3. Нет записей о лекарствах ─────────────────────────────────────────────

  const medications = family.medications || [];
  if (medications.length > 0) {
    // Предупреждаем только если раньше были записи
    const lastMed = medications[0]; // sorted newest first
    const hoursSinceMed = (now - new Date(lastMed.dateTime)) / (1000 * 60 * 60);

    if (hoursSinceMed >= MEDICATION_WARN_HOURS) {
      notifications.push({
        id: "no-medication-entry",
        type: "no_medication_entry",
        severity: "low",
        title: "Нет записей о лекарствах",
        message: NOTIFICATION_MESSAGES.no_medication_entry(Math.floor(hoursSinceMed)),
        data: {
          lastMedicationAt: lastMed.dateTime,
          hoursSinceLast: Math.floor(hoursSinceMed),
          lastMedicine: lastMed.medicineName,
        },
        createdAt: now.toISOString(),
      });
    }
  }

  // ── 4. Эскалация симптомов ───────────────────────────────────────────────────

  const escalation = checkEscalation(family.symptoms);
  if (escalation.alert) {
    notifications.push({
      id: "escalation",
      type: "escalation",
      severity: "high",
      title: "Тревожные симптомы подряд",
      message: NOTIFICATION_MESSAGES.escalation(escalation.streak),
      data: {
        streak: escalation.streak,
        threshold: escalation.threshold,
      },
      createdAt: now.toISOString(),
    });
  }

  // ── 5. Сортировка по severity (high → medium → low) ─────────────────────────

  const severityOrder = { high: 0, medium: 1, low: 2 };
  notifications.sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  res.json({
    familyCode: family.code,
    total: notifications.length,
    hasHighPriority: notifications.some((n) => n.severity === "high"),
    notifications,
    checkedAt: now.toISOString(),
  });
});

export default router;
