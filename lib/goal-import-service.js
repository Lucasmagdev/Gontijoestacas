const crypto = require("crypto");
const { calculateSegmentMeq, getMeqFactor } = require("./meq");

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeMachineToken(value) {
  return stripAccents(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function parseBrNumber(value) {
  if (value == null || value === "") return null;
  const normalized = String(value)
    .replace(/R\$\s*/gi, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!normalized) return null;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : null;
}

function parseInteger(value) {
  const result = parseBrNumber(value);
  return Number.isFinite(result) ? Math.round(result) : null;
}

function parseDateBr(value) {
  const text = String(value || "").trim();
  const brMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    return `${brMatch[3]}-${brMatch[2]}-${brMatch[1]}`;
  }
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return text;
  return "";
}

function firstDefined(obj, keys) {
  for (const key of keys) {
    if (obj?.[key] != null && obj[key] !== "") {
      return obj[key];
    }
  }
  return null;
}

function normalizeSegmentsFromRow(row) {
  if (Array.isArray(row?.segments) && row.segments.length) {
    return row.segments;
  }

  const segments = [];
  for (let index = 1; index <= 6; index += 1) {
    const segment = {
      meta_estacas: firstDefined(row, [`meta_estacas_${index}`, `meta_qtd_estacas_${index}`, `qtd_estacas_${index}`, `quantidade_${index}`]),
      diametro_cm: firstDefined(row, [`diametro_${index}`, `diametro_cm_${index}`, `ø_${index}`, `o_${index}`]),
      profundidade_m: firstDefined(row, [`profundidade_${index}`, `profundidade_m_${index}`]),
      valor_unitario: firstDefined(row, [`valor_${index}`, `valor_unitario_${index}`, `valor_ø_${index}`]),
    };
    if (Object.values(segment).some((value) => value != null && value !== "")) {
      segments.push(segment);
    }
  }
  return segments;
}

function normalizeSegment(segment, index) {
  const metaEstacas = parseInteger(firstDefined(segment, ["meta_estacas", "meta", "quantidade_estacas", "qtd_estacas"]));
  const diametroCm = parseBrNumber(firstDefined(segment, ["diametro_cm", "diametro", "ø", "o"]));
  const profundidadeM = parseBrNumber(firstDefined(segment, ["profundidade_m", "profundidade"]));
  const valorUnitario = parseBrNumber(firstDefined(segment, ["valor_unitario", "valor", "preco"]));
  const filledValues = [metaEstacas, diametroCm, profundidadeM, valorUnitario].filter((value) => value != null).length;

  if (!filledValues) {
    return null;
  }

  const { meqFactor, metaMeqSegmento } = calculateSegmentMeq(metaEstacas, profundidadeM, diametroCm);

  return {
    segment_index: index,
    meta_estacas: metaEstacas ?? 0,
    diametro_cm: diametroCm,
    profundidade_m: profundidadeM,
    valor_unitario: valorUnitario,
    meq_factor: meqFactor,
    meta_meq_segmento: metaMeqSegmento,
    incomplete: filledValues > 0 && filledValues < 4,
  };
}

function buildMachineIndex(machines = []) {
  return machines.map((item) => {
    const machineName = item.active_mapping?.machine_name || item.machine_name || "";
    return {
      imei: item.imei || "",
      machine_name: machineName,
      token: normalizeMachineToken(machineName),
      aliases: [machineName, item.machine_name, item.active_mapping?.machine_name].filter(Boolean).map(normalizeMachineToken),
    };
  });
}

function matchMachine(equipmentLabel, machines = []) {
  const token = normalizeMachineToken(equipmentLabel);
  if (!token) return null;

  const exact = machines.find((item) => item.aliases.includes(token) || item.token === token);
  if (exact) {
    return {
      imei: exact.imei,
      machine_name: exact.machine_name,
      confidence: "exact",
    };
  }

  const loose = machines.find((item) => token.includes(item.token) || item.token.includes(token));
  if (loose) {
    return {
      imei: loose.imei,
      machine_name: loose.machine_name,
      confidence: "loose",
    };
  }

  return null;
}

function normalizeGoalRow(row, machineIndex, options = {}) {
  const warnings = [];
  const errors = [];
  const equipmentLabel = String(firstDefined(row, ["equipment_label", "equipment", "equipamento", "maquina"]) || "").trim();
  const date = parseDateBr(firstDefined(row, ["date", "data"]));
  const obraCode = String(firstDefined(row, ["obra_code", "obra", "numero_obra", "n_obra"]) || "").trim();
  const metaMeqInformado = parseBrNumber(firstDefined(row, ["meta_meq_informado", "meta_meq", "meta_meq_planilha"]));
  const rawSegments = normalizeSegmentsFromRow(row);
  const segments = rawSegments
    .map((segment, index) => normalizeSegment(segment, index + 1))
    .filter(Boolean);
  const manualMachineName = String(firstDefined(row, ["machine_name"]) || "").trim();
  const manualImei = String(firstDefined(row, ["imei"]) || "").trim();
  const machineMatch =
    manualMachineName || manualImei
      ? {
          imei: manualImei,
          machine_name: manualMachineName || equipmentLabel,
          confidence: "manual",
        }
      : matchMachine(equipmentLabel, machineIndex);

  if (!date) {
    errors.push("Data invalida ou ausente.");
  }
  if (!equipmentLabel) {
    errors.push("Equipamento ausente.");
  }
  if (!obraCode) {
    warnings.push("Numero da obra ausente.");
  }
  if (!segments.length) {
    errors.push("Nenhuma faixa valida encontrada.");
  }
  if (!machineMatch) {
    warnings.push("Equipamento nao reconhecido automaticamente.");
  } else if (machineMatch.confidence !== "exact") {
    warnings.push("Equipamento reconhecido com correspondencia aproximada.");
  }

  for (const segment of segments) {
    if (segment.incomplete) {
      errors.push(`Faixa ${segment.segment_index} incompleta.`);
    }
    if (!Number.isFinite(segment.meq_factor)) {
      errors.push(`Faixa ${segment.segment_index} sem fator MEQ valido para o diametro informado.`);
    }
  }

  const metaEstacasTotal = segments.reduce((sum, segment) => sum + (segment.meta_estacas || 0), 0);
  const metaMeqTotal = Number(
    segments.reduce((sum, segment) => sum + (segment.meta_meq_segmento || 0), 0).toFixed(2)
  );

  if (Number.isFinite(metaMeqInformado) && Math.abs(metaMeqInformado - metaMeqTotal) > 0.05) {
    warnings.push(`Meta MEQ informada (${metaMeqInformado.toFixed(2)}) difere da recalculada (${metaMeqTotal.toFixed(2)}).`);
  }

  return {
    id: row.id || crypto.randomUUID(),
    date,
    equipment_label: equipmentLabel,
    machine_name: machineMatch?.machine_name || equipmentLabel,
    imei: machineMatch?.imei || "",
    machine_match: machineMatch,
    obra_code: obraCode,
    meta_estacas_total: metaEstacasTotal,
    meta_meq_total: metaMeqTotal,
    meta_meq_informado: Number.isFinite(metaMeqInformado) ? Number(metaMeqInformado.toFixed(2)) : null,
    source_image_id: options.sourceImageId || "",
    source_file_name: options.sourceFileName || "",
    segments: segments.map((segment) => ({
      segment_index: segment.segment_index,
      meta_estacas: segment.meta_estacas || 0,
      diametro_cm: segment.diametro_cm,
      profundidade_m: segment.profundidade_m,
      valor_unitario: segment.valor_unitario,
      meq_factor: Number.isFinite(segment.meq_factor) ? Number(segment.meq_factor.toFixed(4)) : null,
      meta_meq_segmento: Number.isFinite(segment.meta_meq_segmento) ? Number(segment.meta_meq_segmento.toFixed(2)) : null,
    })),
    warnings,
    errors,
  };
}

function normalizeGoalRows(rows, machines, options = {}) {
  const machineIndex = buildMachineIndex(machines);
  return rows
    .map((row) => normalizeGoalRow(row, machineIndex, options))
    .filter((row) => row.date || row.equipment_label || row.segments.length);
}

function extractJsonFromText(text) {
  const cleaned = String(text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const objectStart = cleaned.indexOf("{");
  const arrayStart = cleaned.indexOf("[");
  const startIndex =
    objectStart === -1 ? arrayStart : arrayStart === -1 ? objectStart : Math.min(objectStart, arrayStart);
  const payload = startIndex >= 0 ? cleaned.slice(startIndex) : cleaned;
  return JSON.parse(payload);
}

async function callGeminiForGoalImport({ mimeType, base64Data, fileName }) {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY nao configurada.");
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt = [
    "Leia a imagem de uma planilha de metas semanais de fundacao e responda APENAS em JSON valido.",
    "Extraia uma lista chamada rows.",
    "Cada row deve conter: date, equipment_label, obra_code, meta_meq_informado, segments.",
    "segments deve ser um array com objetos contendo: meta_estacas, diametro_cm, profundidade_m, valor_unitario.",
    "Nao invente valores. Campos ausentes devem ser null ou string vazia.",
    "A planilha pode ter mais de uma faixa de diametro no mesmo dia.",
    "Use datas no formato dd/mm/yyyy na resposta original.",
    `Nome do arquivo: ${fileName || "imagem"}.`,
  ].join(" ");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini error ${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
  if (!text.trim()) {
    throw new Error("Gemini nao retornou conteudo utilizavel.");
  }

  return extractJsonFromText(text);
}

function parseImageDataUrl(imageDataUrl) {
  const match = String(imageDataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Imagem invalida. Envie um data URL base64.");
  }
  return {
    mimeType: match[1],
    base64Data: match[2],
  };
}

async function parseGoalImportImage({ imageDataUrl, fileName, machines }) {
  const { mimeType, base64Data } = parseImageDataUrl(imageDataUrl);
  const sourceImageId = crypto.randomUUID();
  const geminiPayload = await callGeminiForGoalImport({ mimeType, base64Data, fileName });
  const rows = Array.isArray(geminiPayload?.rows)
    ? geminiPayload.rows
    : Array.isArray(geminiPayload)
    ? geminiPayload
    : [];

  return {
    import_id: sourceImageId,
    source_file_name: fileName || "",
    rows: normalizeGoalRows(rows, machines, {
      sourceImageId,
      sourceFileName: fileName || "",
    }),
  };
}

module.exports = {
  normalizeGoalRows,
  parseGoalImportImage,
};
