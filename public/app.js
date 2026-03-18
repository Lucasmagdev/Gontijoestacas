const healthButton = document.getElementById("healthButton");
const pdfButton = document.getElementById("pdfButton");
const weeklyButton = document.getElementById("weeklyButton");
const healthStatus = document.getElementById("healthStatus");
const searchForm = document.getElementById("searchForm");
const resultBox = document.getElementById("resultBox");
const resultMeta = document.getElementById("resultMeta");
const querySummary = document.getElementById("querySummary");
const resultHint = document.getElementById("resultHint");
const tableWrap = document.getElementById("tableWrap");
const resultsTableBody = document.getElementById("resultsTableBody");
const detailSection = document.getElementById("detailSection");
const detailMeta = document.getElementById("detailMeta");
const detailHeader = document.getElementById("detailHeader");
const detailHint = document.getElementById("detailHint");
const detailSlicesBody = document.getElementById("detailSlicesBody");
const dashboardSection = document.getElementById("dashboardSection");
const dashboardMeta = document.getElementById("dashboardMeta");
const dashboardHint = document.getElementById("dashboardHint");
const dashboardGrid = document.getElementById("dashboardGrid");
const machineSelect = document.getElementById("machineSelect");
const machinesEditor = document.getElementById("machinesEditor");
const saveMachinesButton = document.getElementById("saveMachinesButton");
const resetMachinesButton = document.getElementById("resetMachinesButton");
const machineStatus = document.getElementById("machineStatus");
const clientLoginInput = document.getElementById("clientLogin");
const imeiInput = document.getElementById("imei");
const dateInput = document.getElementById("date");
const weekInput = document.getElementById("weekInput");

const DEFAULT_MACHINES = [
  { name: "HTC-03", imei: "356308047707200" },
  { name: "HTM-01", imei: "353719099360685" },
  { name: "HTM-02", imei: "352353087311780" },
  { name: "HTM-03", imei: "352353087304165" },
  { name: "HTM-04", imei: "352353087311855" },
  { name: "HTM-05", imei: "352353087290521" },
  { name: "CA-02", imei: "358278000324905" },
  { name: "CA-03", imei: "352622021019539" },
  { name: "CA-07", imei: "352622021013953" },
  { name: "CA-04(s)", imei: "352622021150631" },
  { name: "CA-05(s)", imei: "352622021181404" },
  { name: "CA-06(s)", imei: "352622021175398" },
  { name: "CA-09(s)", imei: "352622021184705" },
  { name: "MAIT-01", imei: "352622021182170" },
  { name: "HTM-06", imei: "352353087320450" },
  { name: "EM400-01", imei: "353719099340026" },
  { name: "CA-08", imei: "352622021177063" },
  { name: "MAIT-02", imei: "356078119138507" },
  { name: "MAIT-03", imei: "356078119129365" },
];

const MACHINES_STORAGE_KEY = "geodigitus_machines_v1";

clientLoginInput.value = "cgontijo";
dateInput.value = "2026-03-17";
imeiInput.value = "352622021150631";

function setResult(data) {
  resultBox.textContent = JSON.stringify(data, null, 2);
}

const dashboardCharts = [];

function serializeMachines(machines) {
  return machines.map((item) => `${item.name}=${item.imei}`).join("\n");
}

function parseMachines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, imei] = line.split("=");
      return { name: (name || "").trim(), imei: (imei || "").trim() };
    })
    .filter((item) => item.name && /^\d{15}$/.test(item.imei));
}

function loadMachines() {
  try {
    const raw = localStorage.getItem(MACHINES_STORAGE_KEY);
    if (!raw) return DEFAULT_MACHINES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return DEFAULT_MACHINES;
    return parsed.filter((item) => item?.name && /^\d{15}$/.test(item?.imei));
  } catch {
    return DEFAULT_MACHINES;
  }
}

function saveMachines(machines) {
  localStorage.setItem(MACHINES_STORAGE_KEY, JSON.stringify(machines));
}

function renderMachineOptions(machines) {
  machineSelect.innerHTML = machines
    .map(
      (item) =>
        `<option value="${escapeHtml(item.imei)}">${escapeHtml(item.name)} | ${escapeHtml(item.imei)}</option>`
    )
    .join("");
}

function syncSelectedMachineFromImei(machines) {
  const match = machines.find((item) => item.imei === imeiInput.value.trim());
  if (match) {
    machineSelect.value = match.imei;
  }
}

function refreshMachinesUi(machines, preserveImei = true) {
  const currentImei = imeiInput.value.trim();
  machinesEditor.value = serializeMachines(machines);
  renderMachineOptions(machines);

  if (preserveImei && machines.some((item) => item.imei === currentImei)) {
    machineSelect.value = currentImei;
  } else if (machines[0]) {
    machineSelect.value = machines[0].imei;
    imeiInput.value = machines[0].imei;
  }
}

function getWeekValueFromDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const firstThursday = new Date(date.getFullYear(), 0, 4);
  const firstDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
  const weekNumber = 1 + Math.round((date - firstThursday) / 604800000);
  return `${date.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getWeekStartFromWeekInput(value) {
  const match = String(value || "").match(/^(\d{4})-W(\d{2})$/);
  if (!match) return "";
  const [, yearText, weekText] = match;
  const year = Number(yearText);
  const week = Number(weekText);
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  if (day <= 4) {
    simple.setUTCDate(simple.getUTCDate() - day + 1);
  } else {
    simple.setUTCDate(simple.getUTCDate() + 8 - day);
  }
  return simple.toISOString().slice(0, 10);
}

function destroyDashboardCharts() {
  while (dashboardCharts.length) {
    const chart = dashboardCharts.pop();
    chart.destroy();
  }
}

function resetDashboard() {
  destroyDashboardCharts();
  dashboardGrid.innerHTML = "";
  dashboardSection.classList.add("is-hidden");
  dashboardMeta.textContent = "Nenhum dashboard gerado.";
  dashboardHint.textContent = "Selecione uma semana e clique em buscar.";
}

function renderDashboard(data) {
  destroyDashboardCharts();
  dashboardGrid.innerHTML = "";

  if (!data.machines?.length) {
    dashboardSection.classList.remove("is-hidden");
    dashboardMeta.textContent = "Nenhuma maquina retornada.";
    dashboardHint.textContent = "Nao houve dados para a semana selecionada.";
    return;
  }

  dashboardSection.classList.remove("is-hidden");
  dashboardMeta.textContent = `${data.machines.length} maquina(s) analisada(s) na semana iniciada em ${data.weekStart}.`;
  dashboardHint.textContent = "Barras: metragem realizada por dia. Linha: quantidade de estacas por dia.";

  data.machines.forEach((report, index) => {
    const card = document.createElement("article");
    card.className = "dashboard-card";
    card.innerHTML = `
      <div class="dashboard-card-head">
        <div>
          <h3>${escapeHtml(report.machine.name)}</h3>
          <p class="muted">${escapeHtml(report.machine.imei)}</p>
        </div>
        <div class="dashboard-kpis">
          <div><strong>${escapeHtml(formatDecimal(report.weeklyTotalMeters, 2))} m</strong><span>Total semana</span></div>
          <div><strong>${escapeHtml(report.weeklyTotalCount)}</strong><span>Estacas</span></div>
        </div>
      </div>
      <canvas id="dashboardChart${index}" height="120"></canvas>
    `;
    dashboardGrid.appendChild(card);

    const labels = report.daily.map((item) => item.date.slice(5));
    const meters = report.daily.map((item) => Number(item.totalMeters.toFixed(2)));
    const counts = report.daily.map((item) => item.totalCount);
    const ctx = card.querySelector("canvas");

    const chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: "Realizado (m)",
            data: meters,
            backgroundColor: "rgba(31, 107, 79, 0.72)",
            borderRadius: 8,
            yAxisID: "y",
          },
          {
            type: "line",
            label: "Estacas",
            data: counts,
            borderColor: "#b85c38",
            backgroundColor: "#b85c38",
            tension: 0.35,
            pointRadius: 4,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Metros" },
          },
          y1: {
            beginAtZero: true,
            position: "right",
            grid: { drawOnChartArea: false },
            ticks: { precision: 0 },
            title: { display: true, text: "Estacas" },
          },
        },
      },
    });

    dashboardCharts.push(chart);
  });
}

function formatSize(bytes) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDecimal(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits).replace(".", ",");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTable(items = []) {
  if (!items.length) {
    resultsTableBody.innerHTML = "";
    tableWrap.classList.add("is-hidden");
    return;
  }

  resultsTableBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml((item.estaca || "-").trim())}</td>
          <td>${escapeHtml(formatDecimal(item.diametroCm, 0))}</td>
          <td>${escapeHtml(formatDecimal(item.realizadoM, 2))}</td>
          <td>${escapeHtml(item.finishedAt || "-")}</td>
          <td>${escapeHtml((item.contrato || "-").trim())}</td>
          <td>${escapeHtml((item.obra || "-").trim())}</td>
          <td><button type="button" class="secondary-button" data-key="${escapeHtml(item.key)}">Ver detalhes</button></td>
        </tr>
      `
    )
    .join("");

  tableWrap.classList.remove("is-hidden");
}

function resetDetail() {
  detailSection.classList.add("is-hidden");
  detailMeta.textContent = "Nenhuma estaca carregada.";
  detailHint.textContent = "Aguardando selecao.";
  detailHeader.innerHTML = "";
  detailSlicesBody.innerHTML = "";
}

function renderDetail(data) {
  const { parsed, key } = data;
  const header = parsed.header || {};
  const phases = parsed.phases || {};

  detailHeader.innerHTML = [
    ["Arquivo", key],
    ["Versao", header.version],
    ["Contrato", header.contrato],
    ["Obra", header.obra],
    ["Numero", header.numero],
    ["Diametro", header.diametro],
    ["Bomba", header.bomba],
    ["Inclinacao", header.inclinacao],
    ["Linha 8", header.linha8],
    ["Inicio perfuracao", header.inicioPerfuracao],
    ["Fim perfuracao", header.fimPerfuracao],
    ["Inicio concretagem", header.inicioConcretagem],
    ["Fim concretagem", header.fimConcretagem],
    ["Profundidade", `${phases.depthCm ?? 0} cm`],
    ["Fatias perfuracao", phases.drillingSlices ?? 0],
    ["Fatias concretagem", phases.concretingSlices ?? 0],
  ]
    .map(
      ([label, value]) => `
        <div class="detail-item">
          <span class="detail-label">${escapeHtml(label)}</span>
          <strong>${escapeHtml(String(value ?? "-").trim())}</strong>
        </div>
      `
    )
    .join("");

  detailSlicesBody.innerHTML = (parsed.slices || [])
    .map(
      (slice) => `
        <tr>
          <td>${escapeHtml(slice.index)}</td>
          <td>${escapeHtml(slice.timeTick)}</td>
          <td>${escapeHtml(slice.value2)}</td>
          <td>${escapeHtml(slice.value3)}</td>
        </tr>
      `
    )
    .join("");

  detailMeta.textContent = "Estaca convertida com sucesso.";
  detailHint.textContent = `${parsed.slices?.length || 0} fatia(s) carregada(s).`;
  detailSection.classList.remove("is-hidden");
}

async function loadDetail(key) {
  detailSection.classList.remove("is-hidden");
  detailMeta.textContent = "Carregando detalhes...";
  detailHint.textContent = "Baixando binario e convertendo estaca.";
  detailHeader.innerHTML = "";
  detailSlicesBody.innerHTML = "";
  detailSection.scrollIntoView({ behavior: "smooth", block: "start" });

  try {
    const query = new URLSearchParams({ key });
    const response = await fetch(`/api/estacas/detail?${query.toString()}`);
    const data = await response.json();

    if (!data.ok) {
      detailMeta.textContent = "Falha ao converter estaca.";
      detailHint.textContent = data.details || data.message || "Erro no backend.";
      return;
    }

    renderDetail(data);
  } catch (error) {
    detailMeta.textContent = "Falha ao converter estaca.";
    detailHint.textContent = error.message;
  }
}

function setSummary({ clientLogin, imei, date, prefix }) {
  querySummary.textContent =
    `Cliente: ${clientLogin || "-"} | IMEI: ${imei || "-"} | Data: ${date || "-"} | Prefixo: ${prefix || "-"}`;
}

function currentSearchParams() {
  return {
    clientLogin: clientLoginInput.value.trim(),
    imei: imeiInput.value.trim(),
    date: dateInput.value,
  };
}

const initialMachines = loadMachines();
refreshMachinesUi(initialMachines, false);
syncSelectedMachineFromImei(initialMachines);
weekInput.value = getWeekValueFromDate(dateInput.value);

healthButton.addEventListener("click", async () => {
  healthStatus.textContent = "Testando...";
  resultHint.textContent = "Validando conexao com o bucket configurado.";

  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    healthStatus.textContent = data.ok ? "Conexao OK." : "Falha na conexao.";
    setResult(data);
    renderTable([]);
    resetDetail();
    resetDashboard();
    resultMeta.textContent = "Teste de conexao executado.";
    resultHint.textContent = data.ok
      ? "Bucket acessivel. Agora voce pode testar a busca por cliente, IMEI e data."
      : "A conexao ao bucket falhou. Revise as variaveis de ambiente do backend.";
  } catch (error) {
    healthStatus.textContent = "Erro ao testar conexao.";
    setResult({ ok: false, error: error.message });
    renderTable([]);
    resetDetail();
    resetDashboard();
    resultHint.textContent = "Nao foi possivel falar com o backend.";
  }
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const { clientLogin, imei, date } = currentSearchParams();
  setSummary({ clientLogin, imei, date, prefix: "(calculando...)" });

  resultMeta.textContent = "Consultando...";
  resultHint.textContent = "Consulta enviada ao backend. Gerando resumo operacional das estacas.";

  try {
    const query = new URLSearchParams({ clientLogin, imei, date });
    const response = await fetch(`/api/estacas/summary?${query.toString()}`);
    const data = await response.json();
    setSummary({ clientLogin, imei, date, prefix: data.prefix });

    if (data.ok) {
      resultMeta.textContent = `${data.count} arquivo(s) encontrado(s) em ${data.prefix}`;
      resultHint.textContent =
        data.count > 0
          ? "Resumo operacional gerado a partir das fatias de cada estaca."
          : "Nenhum arquivo encontrado para este cliente, IMEI e data. Isso indica consulta vazia, nao erro de interface.";
      renderTable(data.items || []);
      resetDetail();
    } else {
      resultMeta.textContent = "Consulta retornou erro.";
      resultHint.textContent = "O backend respondeu com erro. Veja os detalhes abaixo.";
      renderTable([]);
      resetDetail();
    }

    setResult(data);
  } catch (error) {
    resultMeta.textContent = "Erro ao consultar.";
    resultHint.textContent = "Nao foi possivel completar a consulta.";
    renderTable([]);
    resetDetail();
    setResult({ ok: false, error: error.message });
  }
});

resultsTableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-key]");
  if (!button) return;
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Carregando...";
  loadDetail(button.dataset.key).finally(() => {
    button.disabled = false;
    button.textContent = originalText;
  });
});

pdfButton.addEventListener("click", async () => {
  const { clientLogin, imei, date } = currentSearchParams();
  const originalText = pdfButton.textContent;
  pdfButton.disabled = true;
  pdfButton.textContent = "Gerando PDF...";

  try {
    const query = new URLSearchParams({ clientLogin, imei, date });
    const response = await fetch(`/api/estacas/summary/pdf?${query.toString()}`);

    if (!response.ok) {
      let message = "Falha ao gerar PDF.";
      try {
        const data = await response.json();
        message = data.details || data.message || message;
      } catch {
      }
      resultHint.textContent = message;
      return;
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diario-estacas-${clientLogin}-${imei}-${date}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    resultHint.textContent = "PDF gerado com sucesso.";
  } catch (error) {
    resultHint.textContent = error.message;
  } finally {
    pdfButton.disabled = false;
    pdfButton.textContent = originalText;
  }
});

machineSelect.addEventListener("change", () => {
  imeiInput.value = machineSelect.value;
});

imeiInput.addEventListener("input", () => {
  syncSelectedMachineFromImei(loadMachines());
});

saveMachinesButton.addEventListener("click", () => {
  const machines = parseMachines(machinesEditor.value);
  if (!machines.length) {
    machineStatus.textContent = "Nenhuma maquina valida encontrada. Use NOME=IMEI com 15 digitos.";
    return;
  }

  saveMachines(machines);
  refreshMachinesUi(machines);
  machineStatus.textContent = `${machines.length} maquina(s) salva(s) no navegador.`;
});

resetMachinesButton.addEventListener("click", () => {
  saveMachines(DEFAULT_MACHINES);
  refreshMachinesUi(DEFAULT_MACHINES);
  machineStatus.textContent = "Lista padrao restaurada.";
});

dateInput.addEventListener("change", () => {
  weekInput.value = getWeekValueFromDate(dateInput.value);
});

weeklyButton.addEventListener("click", async () => {
  const weekStart = getWeekStartFromWeekInput(weekInput.value);
  const machines = loadMachines();

  if (!weekStart) {
    dashboardSection.classList.remove("is-hidden");
    dashboardMeta.textContent = "Semana invalida.";
    dashboardHint.textContent = "Selecione uma semana valida.";
    return;
  }

  dashboardSection.classList.remove("is-hidden");
  dashboardMeta.textContent = "Gerando dashboard semanal...";
  dashboardHint.textContent = "Consultando estacas da semana para cada maquina.";
  dashboardGrid.innerHTML = "";

  const originalText = weeklyButton.textContent;
  weeklyButton.disabled = true;
  weeklyButton.textContent = "Buscando semana...";

  try {
    const response = await fetch("/api/dashboard/weekly", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientLogin: clientLoginInput.value.trim(),
        weekStart,
        machines,
      }),
    });
    const data = await response.json();

    if (!data.ok) {
      dashboardMeta.textContent = "Falha ao gerar dashboard.";
      dashboardHint.textContent = data.details || data.message || "Erro no backend.";
      return;
    }

    renderDashboard(data);
  } catch (error) {
    dashboardMeta.textContent = "Falha ao gerar dashboard.";
    dashboardHint.textContent = error.message;
  } finally {
    weeklyButton.disabled = false;
    weeklyButton.textContent = originalText;
  }
});
