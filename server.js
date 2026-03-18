const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
const PDFDocument = require("pdfkit");
const {
  S3Client,
  ListObjectsV2Command,
  HeadBucketCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
app.use(express.json({ limit: "1mb" }));

const requiredEnv = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET",
];

function missingEnvVars() {
  return requiredEnv.filter((name) => !process.env[name]);
}

function buildS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || "sa-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
}

function getClientLogin(value) {
  return String(value || process.env.S3_CLIENT_LOGIN || "cgontijo").trim();
}

function buildPrefix(clientLogin, imei, date) {
  const [year, month, day] = date.split("-");
  const base = (process.env.S3_PREFIX_BASE || "c").replace(/\/+$/, "");
  return `${base}/${clientLogin}/h/${imei}/${year}/${month}/${day}/`;
}

function parseEstacaKey(key) {
  const fileName = key.split("/").pop() || "";
  const match = fileName.match(
    /^(\d{6})-([^-]+)-([^-]+)-(.+)$/
  );

  if (!match) {
    return {
      fileName,
      finishedAt: null,
      contrato: null,
      obra: null,
      estaca: null,
    };
  }

  const [, hhmmss, contratoRaw, obraRaw, estacaRaw] = match;
  const decode = (value) =>
    value.replace(/e/g, " ").replace(/s/g, "-").replace(/p/g, ".").replace(/a/g, "+");

  return {
    fileName,
    finishedAt: `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}`,
    contrato: decode(contratoRaw),
    obra: decode(obraRaw),
    estaca: decode(estacaRaw),
  };
}

function getConverterPath() {
  const toolName = process.platform === "win32" ? "sacibin2txt.exe" : "sacibin2txt";
  return path.join(__dirname, "tools", toolName);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getCacheDir() {
  return path.join(__dirname, ".cache", "estacas");
}

function getCacheFilePath(key) {
  const hash = crypto.createHash("sha1").update(key).digest("hex");
  return path.join(getCacheDir(), `${hash}.json`);
}

function readCachedDetail(key) {
  try {
    const filePath = getCacheFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeCachedDetail(key, detail) {
  try {
    ensureDir(getCacheDir());
    fs.writeFileSync(getCacheFilePath(key), JSON.stringify(detail), "utf8");
  } catch {
  }
}

function parseDateString(date) {
  const [year, month, day] = String(date).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildWeekDates(weekStart) {
  const start = parseDateString(weekStart);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(start);
    current.setUTCDate(start.getUTCDate() + index);
    return formatUtcDate(current);
  });
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function runConverter(inputBuffer) {
  return new Promise((resolve, reject) => {
    const converterPath = getConverterPath();

    if (!fs.existsSync(converterPath)) {
      reject(new Error(`Conversor nao encontrado em ${converterPath}`));
      return;
    }

    const child = spawn(converterPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Conversor retornou codigo ${code}: ${Buffer.concat(stderrChunks).toString("utf8")}`
          )
        );
        return;
      }

      resolve(Buffer.concat(stdoutChunks).toString("utf8"));
    });

    child.stdin.write(inputBuffer);
    child.stdin.end();
  });
}

function parseNumericLine(line) {
  return line
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => Number(part));
}

function calculateDepthAndPhases(sliceLines) {
  let drilling = 0;
  let concreting = 0;
  let drillingInProgress = true;
  let last = null;

  for (const tick of sliceLines) {
    const [current] = parseNumericLine(tick);

    if (Number.isNaN(current)) {
      continue;
    }

    if (drillingInProgress) {
      if (current === last) {
        drillingInProgress = false;
      } else {
        drilling += 1;
      }
    } else {
      concreting += 1;
    }

    last = current;
  }

  return {
    drillingSlices: drilling,
    concretingSlices: concreting,
    depthCm: Math.max(drilling, concreting) * 8,
  };
}

function parseConvertedText(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const meaningful = lines.filter((line) => line.trim().length > 0);

  if (meaningful.length < 12) {
    throw new Error("Saida do conversor invalida ou incompleta.");
  }

  const headerLines = meaningful.slice(0, 12);
  const sliceLines = meaningful.slice(12);
  const phaseSummary = calculateDepthAndPhases(sliceLines);

  const slices = sliceLines.map((line, index) => {
    const [timeTick, value2, value3] = parseNumericLine(line);
    return {
      index: index + 1,
      raw: line,
      timeTick,
      value2,
      value3,
    };
  });

  return {
    header: {
      version: headerLines[0] || "",
      contrato: headerLines[1] || "",
      obra: headerLines[2] || "",
      numero: headerLines[3] || "",
      diametro: headerLines[4] || "",
      bomba: headerLines[5] || "",
      inclinacao: headerLines[6] || "",
      linha8: headerLines[7] || "",
      inicioPerfuracao: headerLines[8] || "",
      fimPerfuracao: headerLines[9] || "",
      inicioConcretagem: headerLines[10] || "",
      fimConcretagem: headerLines[11] || "",
    },
    phases: phaseSummary,
    slices,
  };
}

async function getObjectBuffer(client, key) {
  const result = await client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
    })
  );

  return streamToBuffer(result.Body);
}

async function buildEstacaDetail(client, key) {
  const cached = readCachedDetail(key);
  if (cached) {
    return cached;
  }

  const bodyBuffer = await getObjectBuffer(client, key);
  const convertedText = await runConverter(bodyBuffer);
  const parsed = parseConvertedText(convertedText);

  const detail = {
    key,
    size: bodyBuffer.length,
    parsed,
  };

  writeCachedDetail(key, detail);
  return detail;
}

function toOperationalSummary(item, detail) {
  const header = detail.parsed.header || {};
  const phases = detail.parsed.phases || {};
  const diameterMm = Number(String(header.diametro || "").replace(",", ".").trim());
  const diameterCm = Number.isFinite(diameterMm) ? diameterMm / 10 : null;
  const realizadoM = Number.isFinite(phases.depthCm) ? phases.depthCm / 100 : null;

  return {
    key: item.key,
    fileName: item.fileName,
    finishedAt: item.finishedAt,
    contrato: (header.contrato || item.contrato || "").trim(),
    obra: (header.obra || item.obra || "").trim(),
    estaca: (header.numero || item.estaca || "").trim(),
    diametroCm: diameterCm,
    realizadoM: realizadoM,
    profundidadeCm: phases.depthCm ?? 0,
    drillingSlices: phases.drillingSlices ?? 0,
    concretingSlices: phases.concretingSlices ?? 0,
  };
}

async function listEstacasByPrefix(client, prefix) {
  const result = await client.send(
    new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET,
      Prefix: prefix,
    })
  );

  return (result.Contents || []).map((item) => {
    const parsed = parseEstacaKey(item.Key);
    return {
      key: item.Key,
      size: item.Size,
      lastModified: item.LastModified,
      ...parsed,
    };
  });
}

async function buildOperationalSummaries(client, prefix) {
  const objects = await listEstacasByPrefix(client, prefix);
  const summaries = [];

  for (const item of objects) {
    const detail = await buildEstacaDetail(client, item.key);
    summaries.push(toOperationalSummary(item, detail));
  }

  return summaries;
}

function ensurePdfSpace(doc, needed = 28) {
  if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function buildDiaryPdf({ clientLogin, imei, date, items, prefix }) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  const chunks = [];

  doc.on("data", (chunk) => chunks.push(chunk));

  doc.fontSize(20).text("Diario de Estacas", { align: "center" });
  doc.moveDown(0.6);
  doc.fontSize(10);
  doc.text(`Cliente: ${clientLogin}`);
  doc.text(`IMEI: ${imei}`);
  doc.text(`Data: ${date}`);
  doc.text(`Prefixo: ${prefix}`);
  doc.text(`Total de estacas: ${items.length}`);
  doc.moveDown();

  const tableTopBase = doc.y;
  const col = {
    estaca: 40,
    diametro: 170,
    realizado: 270,
    fim: 370,
    contrato: 445,
    obra: 515,
  };

  const drawHeader = () => {
    ensurePdfSpace(doc, 30);
    const top = doc.y;
    doc.rect(40, top, 515, 24).fill("#ece6da");
    doc.fillColor("#000").fontSize(10).font("Helvetica-Bold");
    doc.text("Pilar/Estaca", col.estaca + 4, top + 7, { width: 120 });
    doc.text("Diametro (cm)", col.diametro + 4, top + 7, { width: 90 });
    doc.text("Realizado (m)", col.realizado + 4, top + 7, { width: 90 });
    doc.text("Fim", col.fim + 4, top + 7, { width: 60 });
    doc.text("Contrato", col.contrato + 4, top + 7, { width: 65 });
    doc.text("Obra", col.obra + 4, top + 7, { width: 35 });
    doc.y = top + 24;
    doc.font("Helvetica").fontSize(10);
  };

  drawHeader();

  for (const item of items) {
    ensurePdfSpace(doc, 24);
    const top = doc.y;
    doc.rect(40, top, 515, 24).stroke("#c7bead");
    doc.text(String(item.estaca || "").trim(), col.estaca + 4, top + 7, { width: 120 });
    doc.text(item.diametroCm != null ? String(Math.round(item.diametroCm)).replace(".", ",") : "-", col.diametro + 4, top + 7, { width: 90 });
    doc.text(item.realizadoM != null ? item.realizadoM.toFixed(2).replace(".", ",") : "-", col.realizado + 4, top + 7, { width: 90 });
    doc.text(item.finishedAt || "-", col.fim + 4, top + 7, { width: 60 });
    doc.text(String(item.contrato || "").trim(), col.contrato + 4, top + 7, { width: 65 });
    doc.text(String(item.obra || "").trim(), col.obra + 4, top + 7, { width: 35 });
    doc.y = top + 24;
    if (doc.y + 40 > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }
  }

  doc.moveDown(1.2);
  ensurePdfSpace(doc, 60);
  doc.font("Helvetica-Bold").text("Observacoes do calculo");
  doc.font("Helvetica").fontSize(9);
  doc.text("- Cada fatia representa 8 cm, conforme a documentacao da Geodigitus.");
  doc.text("- O campo Realizado (m) foi calculado a partir da contagem de fatias convertidas.");
  doc.text("- O diametro foi lido do cabecalho gerado pelo sacibin2txt.");

  doc.end();

  return new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", async (_req, res) => {
  const missing = missingEnvVars();

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  try {
    const client = buildS3Client();
    await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));

    return res.json({
      ok: true,
      message: "Conexao com o bucket validada.",
      bucket: process.env.S3_BUCKET,
      region: process.env.AWS_REGION || "sa-east-1",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao validar acesso ao bucket.",
      error: error.name,
      details: error.message,
    });
  }
});

app.get("/api/estacas", async (req, res) => {
  const missing = missingEnvVars();
  const { imei, date, clientLogin } = req.query;

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  if (!/^\d{15}$/.test(String(imei || ""))) {
    return res.status(400).json({
      ok: false,
      message: "IMEI invalido. Informe 15 digitos numericos.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return res.status(400).json({
      ok: false,
      message: "Data invalida. Use o formato YYYY-MM-DD.",
    });
  }

  const normalizedClientLogin = getClientLogin(clientLogin);
  const prefix = buildPrefix(normalizedClientLogin, imei, date);

  try {
    const client = buildS3Client();
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.S3_BUCKET,
        Prefix: prefix,
      })
    );

    const objects = (result.Contents || []).map((item) => {
      const parsed = parseEstacaKey(item.Key);
      return {
        key: item.Key,
        size: item.Size,
        lastModified: item.LastModified,
        ...parsed,
      };
    });

    return res.json({
      ok: true,
      bucket: process.env.S3_BUCKET,
      clientLogin: normalizedClientLogin,
      prefix,
      count: objects.length,
      items: objects,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao consultar objetos no S3.",
      error: error.name,
      details: error.message,
      prefix,
    });
  }
});

app.get("/api/estacas/summary", async (req, res) => {
  const missing = missingEnvVars();
  const { imei, date, clientLogin } = req.query;

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  if (!/^\d{15}$/.test(String(imei || ""))) {
    return res.status(400).json({
      ok: false,
      message: "IMEI invalido. Informe 15 digitos numericos.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return res.status(400).json({
      ok: false,
      message: "Data invalida. Use o formato YYYY-MM-DD.",
    });
  }

  const normalizedClientLogin = getClientLogin(clientLogin);
  const prefix = buildPrefix(normalizedClientLogin, imei, date);

  try {
    const client = buildS3Client();
    const summaries = await buildOperationalSummaries(client, prefix);

    return res.json({
      ok: true,
      bucket: process.env.S3_BUCKET,
      clientLogin: normalizedClientLogin,
      prefix,
      count: summaries.length,
      items: summaries,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao gerar resumo das estacas.",
      error: error.name,
      details: error.message,
      prefix,
    });
  }
});

app.get("/api/estacas/summary/pdf", async (req, res) => {
  const missing = missingEnvVars();
  const { imei, date, clientLogin } = req.query;

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  if (!/^\d{15}$/.test(String(imei || ""))) {
    return res.status(400).json({
      ok: false,
      message: "IMEI invalido. Informe 15 digitos numericos.",
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) {
    return res.status(400).json({
      ok: false,
      message: "Data invalida. Use o formato YYYY-MM-DD.",
    });
  }

  const normalizedClientLogin = getClientLogin(clientLogin);
  const prefix = buildPrefix(normalizedClientLogin, imei, date);

  try {
    const client = buildS3Client();
    const items = await buildOperationalSummaries(client, prefix);
    const pdfBuffer = await buildDiaryPdf({
      clientLogin: normalizedClientLogin,
      imei,
      date,
      items,
      prefix,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"diario-estacas-${normalizedClientLogin}-${imei}-${date}.pdf\"`
    );
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao gerar diario em PDF.",
      error: error.name,
      details: error.message,
      prefix,
    });
  }
});

app.post("/api/dashboard/weekly", async (req, res) => {
  const missing = missingEnvVars();
  const { clientLogin, weekStart, machines } = req.body || {};

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(weekStart || ""))) {
    return res.status(400).json({
      ok: false,
      message: "weekStart invalido. Use o formato YYYY-MM-DD.",
    });
  }

  if (!Array.isArray(machines) || machines.length === 0) {
    return res.status(400).json({
      ok: false,
      message: "Informe ao menos uma maquina para o dashboard semanal.",
    });
  }

  const normalizedClientLogin = getClientLogin(clientLogin);
  const weekDates = buildWeekDates(weekStart);
  const normalizedMachines = machines
    .map((item) => ({
      name: String(item?.name || "").trim(),
      imei: String(item?.imei || "").trim(),
    }))
    .filter((item) => item.name && /^\d{15}$/.test(item.imei));

  if (!normalizedMachines.length) {
    return res.status(400).json({
      ok: false,
      message: "Nenhuma maquina valida foi enviada.",
    });
  }

  try {
    const client = buildS3Client();
    const machineReports = [];

    for (const machine of normalizedMachines) {
      const daily = [];
      let weeklyTotalMeters = 0;
      let weeklyTotalCount = 0;

      for (const date of weekDates) {
        const prefix = buildPrefix(normalizedClientLogin, machine.imei, date);
        const summaries = await buildOperationalSummaries(client, prefix);
        const totalMeters = summaries.reduce((sum, item) => sum + (item.realizadoM || 0), 0);
        const totalCount = summaries.length;

        daily.push({
          date,
          totalMeters,
          totalCount,
        });

        weeklyTotalMeters += totalMeters;
        weeklyTotalCount += totalCount;
      }

      machineReports.push({
        machine,
        daily,
        weeklyTotalMeters,
        weeklyTotalCount,
      });
    }

    return res.json({
      ok: true,
      clientLogin: normalizedClientLogin,
      weekStart,
      weekDates,
      machines: machineReports,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao gerar dashboard semanal.",
      error: error.name,
      details: error.message,
    });
  }
});

app.get("/api/estacas/detail", async (req, res) => {
  const missing = missingEnvVars();
  const { key } = req.query;

  if (missing.length > 0) {
    return res.status(500).json({
      ok: false,
      message: "Variaveis de ambiente obrigatorias ausentes.",
      missing,
    });
  }

  if (!key || typeof key !== "string") {
    return res.status(400).json({
      ok: false,
      message: "Parametro key obrigatorio.",
    });
  }

  try {
    const client = buildS3Client();
    const detail = await buildEstacaDetail(client, key);

    return res.json({
      ok: true,
      bucket: process.env.S3_BUCKET,
      key: detail.key,
      size: detail.size,
      parsed: detail.parsed,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: "Falha ao baixar ou converter a estaca.",
      error: error.name,
      details: error.message,
      key,
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor em http://localhost:${port}`);
});
