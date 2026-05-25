import { Router } from "express";
import {
  createFamily,
  joinFamily,
  getFamily,
  addSymptom,
  addTask,
  updateTask,
  buildDoctorReport,
  checkEscalation,
} from "../store.js";

const router = Router();

router.post("/families", (req, res) => {
  const { circleName, lovedOneName, coordinatorName } = req.body || {};
  if (!circleName?.trim() || !lovedOneName?.trim() || !coordinatorName?.trim()) {
    return res.status(400).json({ error: "Заполните название круга, имя близкого и ваше имя." });
  }
  const family = createFamily({ circleName, lovedOneName, coordinatorName });
  res.status(201).json(family);
});

router.post("/families/join", (req, res) => {
  const { code, name, role } = req.body || {};
  if (!code?.trim() || !name?.trim()) {
    return res.status(400).json({ error: "Укажите код приглашения и ваше имя." });
  }
  const result = joinFamily(code, { name, role });
  if (!result) {
    return res.status(404).json({ error: "Круг не найден. Проверьте код." });
  }
  res.json(result);
});

router.get("/families/:code", (req, res) => {
  const family = getFamily(req.params.code);
  if (!family) {
    return res.status(404).json({ error: "Круг не найден." });
  }
  const escalation = checkEscalation(family.symptoms);
  res.json({ ...family, escalation });
});

router.post("/families/:code/symptoms", (req, res) => {
  const { type, note, memberId, memberName } = req.body || {};
  const allowed = ["good", "pain", "nausea", "weakness", "confusion", "fall", "other"];
  if (!allowed.includes(type)) {
    return res.status(400).json({ error: "Некорректный тип записи." });
  }
  const entry = addSymptom(req.params.code, { type, note, memberId, memberName });
  if (!entry) {
    return res.status(404).json({ error: "Круг не найден." });
  }
  res.status(201).json(entry);
});

router.post("/families/:code/tasks", (req, res) => {
  const { title, assignee, dueDate, createdBy } = req.body || {};
  if (!title?.trim()) {
    return res.status(400).json({ error: "Укажите название задачи." });
  }
  const task = addTask(req.params.code, { title, assignee, dueDate, createdBy });
  if (!task) {
    return res.status(404).json({ error: "Круг не найден." });
  }
  res.status(201).json(task);
});

router.patch("/families/:code/tasks/:taskId", (req, res) => {
  const { status } = req.body || {};
  if (!["open", "done"].includes(status)) {
    return res.status(400).json({ error: "Статус: open или done." });
  }
  const task = updateTask(req.params.code, req.params.taskId, { status });
  if (!task) {
    return res.status(404).json({ error: "Задача или круг не найдены." });
  }
  res.json(task);
});

router.get("/families/:code/report", (req, res) => {
  const family = getFamily(req.params.code);
  if (!family) {
    return res.status(404).json({ error: "Круг не найден." });
  }
  res.json(buildDoctorReport(family));
});

router.get("/scripts", (_req, res) => {
  res.json(SCRIPTS);
});

const SCRIPTS = [
  {
    id: "doctor-visit",
    title: "Как предложить визит к врачу",
    titleKz: "Дәрігерге баруды қалай ұсынуға болады",
    body: `«Мама/папа, я переживаю не потому что ты слабый(ая), а потому что хочу, чтобы тебе было легче. Давай просто сходим к терапевту — это как техосмотр: проверим и будем спокойны. Я сам(а) запишу и поеду с тобой.»`,
  },
  {
    id: "siblings",
    title: "Как договориться с братьями/сёстрами",
    titleKz: "Ағайындармен қалай келісуге болады",
    body: `«Давайте без обвинений: вот список дел на неделю. Каждый выбирает 2–3 пункта, что реально может. Если не успеваешь — напиши в общий чат заранее, перераспределим.»`,
  },
  {
    id: "emergency",
    title: "Когда звонить 103",
    titleKz: "103-ке қашан қоңырау шалу керек",
    body: `Звоните 103 при: сильной боли в груди, одышке, потере сознания, подозрении на инсульт (асимметрия лица, речь), сильном кровотечении. При сомнении — лучше позвонить. Это не «паника», это безопасность.`,
  },
  {
    id: "egov",
    title: "Соцуслуги на дому (egov)",
    titleKz: "Үйде әлеуметтік қызмет (egov)",
    body: `На egov.kz можно оформить специальные социальные услуги на дому для пожилых и лиц с инвалидностью. Подготовьте удостоверение личности, мед. карту. Оформление может делать законный представитель.`,
  },
];

export default router;
