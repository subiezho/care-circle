import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import apiRouter from "./routes/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", apiRouter);

app.get("/healthz", (_req, res) => {
  res.status(200).json({ ok: true });
});

const publicDir = path.join(__dirname, "..", "public");
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Үйдегі күтім MVP → http://localhost:${PORT}`);
});
