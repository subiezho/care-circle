import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "database.json");

const DEFAULT_DB = { families: {} };

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readDb() {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    writeDb(DEFAULT_DB);
    return structuredClone(DEFAULT_DB);
  }
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDb(db) {
  ensureDataDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

export function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  return code;
}

export function id() {
  return crypto.randomBytes(8).toString("hex");
}

export function getFamily(code) {
  const db = readDb();
  return db.families[code.toUpperCase()] ?? null;
}

export function createFamily({ circleName, lovedOneName, coordinatorName }) {
  const db = readDb();
  let code = generateCode();
  while (db.families[code]) {
    code = generateCode();
  }

  const now = new Date().toISOString();
  const family = {
    code,
    circleName: circleName.trim(),
    lovedOneName: lovedOneName.trim(),
    createdAt: now,
    members: [
      {
        id: id(),
        name: coordinatorName.trim(),
        role: "coordinator",
        joinedAt: now,
      },
    ],
    symptoms: [],
    tasks: [],
  };

  db.families[code] = family;
  writeDb(db);
  return family;
}

export function joinFamily(code, { name, role }) {
  const db = readDb();
  const key = code.toUpperCase();
  const family = db.families[key];
  if (!family) return null;

  const member = {
    id: id(),
    name: name.trim(),
    role: role || "caregiver",
    joinedAt: new Date().toISOString(),
  };
  family.members.push(member);
  writeDb(db);
  return { family, member };
}

export function addSymptom(code, { type, note, memberId, memberName }) {
  const db = readDb();
  const family = db.families[code.toUpperCase()];
  if (!family) return null;

  const entry = {
    id: id(),
    type,
    note: (note || "").trim(),
    memberId,
    memberName,
    createdAt: new Date().toISOString(),
  };
  family.symptoms.unshift(entry);
  if (family.symptoms.length > 200) {
    family.symptoms = family.symptoms.slice(0, 200);
  }
  writeDb(db);
  return entry;
}

export function addTask(code, { title, assignee, dueDate, createdBy }) {
  const db = readDb();
  const family = db.families[code.toUpperCase()];
  if (!family) return null;

  const task = {
    id: id(),
    title: title.trim(),
    assignee: (assignee || "").trim(),
    dueDate: dueDate || null,
    status: "open",
    createdBy,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  family.tasks.unshift(task);
  writeDb(db);
  return task;
}

export function updateTask(code, taskId, { status }) {
  const db = readDb();
  const family = db.families[code.toUpperCase()];
  if (!family) return null;

  const task = family.tasks.find((t) => t.id === taskId);
  if (!task) return null;

  task.status = status;
  task.completedAt = status === "done" ? new Date().toISOString() : null;
  writeDb(db);
  return task;
}

const BAD_TYPES = new Set(["pain", "nausea", "weakness", "confusion", "fall"]);

export function checkEscalation(symptoms, days = 3) {
  const byDay = new Map();
  for (const s of symptoms) {
    const day = s.createdAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  }

  const sortedDays = [...byDay.keys()].sort().reverse();
  let streak = 0;
  for (const day of sortedDays) {
    const hasBad = byDay.get(day).some((s) => BAD_TYPES.has(s.type));
    if (hasBad) streak++;
    else break;
  }
  return { alert: streak >= days, streak, threshold: days };
}

export function buildDoctorReport(family) {
  const last30 = family.symptoms.filter((s) => {
    const d = new Date(s.createdAt);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return d.getTime() >= cutoff;
  });

  const typeLabels = {
    good: "Хороший день",
    pain: "Боль",
    nausea: "Тошнота / рвота",
    weakness: "Слабость",
    confusion: "Спутанность",
    fall: "Падение",
    other: "Другое",
  };

  return {
    circleName: family.circleName,
    lovedOneName: family.lovedOneName,
    generatedAt: new Date().toISOString(),
    periodDays: 30,
    entries: last30.map((s) => ({
      date: s.createdAt,
      type: typeLabels[s.type] || s.type,
      note: s.note,
      recordedBy: s.memberName,
    })),
    openTasks: family.tasks.filter((t) => t.status !== "done"),
    escalation: checkEscalation(family.symptoms),
  };
}
