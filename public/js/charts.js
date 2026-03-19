const chartRegistry = new Map();

function destroyChart(id) {
  const chart = chartRegistry.get(id);
  if (chart) {
    chart.destroy();
    chartRegistry.delete(id);
  }
}

function statusTone(percent) {
  if (percent == null) return 'neutral';
  if (percent >= 100) return 'green';
  if (percent >= 70) return 'orange';
  return 'red';
}

export function renderBuildingCard(container, options) {
  const percent = options.percent == null ? null : Number(options.percent.toFixed(1));
  const tone = statusTone(percent);
  const realized = Number(options.realized || 0);
  const goal = Number(options.goal || 0);
  container.innerHTML = `
    <article class="hero-card ${options.accent ? 'hero-card--accent' : ''}">
      <div class="panel-head">
        <div>
          <p class="eyebrow">${options.eyebrow || 'Meta'}</p>
          <h3>${options.title}</h3>
        </div>
        <span class="status-tag ${tone}">
          ${percent == null ? 'Sem meta' : `${percent}% da meta`}
        </span>
      </div>
      <div class="building-chart">
        <div class="building-figure">
          <div class="building-fill" style="height:${Math.max(0, Math.min(percent || 0, 100))}%"></div>
          <div class="building-grid">${'<span></span>'.repeat(30)}</div>
        </div>
        <div class="building-label">
          <strong>${realized}</strong>
          <p>${options.description || ''}</p>
          <div class="summary-strip">
            <div class="summary-chip">
              <span>Realizado</span>
              <strong>${realized}</strong>
            </div>
            <div class="summary-chip">
              <span>Meta</span>
              <strong>${goal}</strong>
            </div>
            <div class="summary-chip">
              <span>Percentual</span>
              <strong>${percent == null ? '-' : `${percent}%`}</strong>
            </div>
          </div>
        </div>
      </div>
    </article>
  `;
}

export function renderLineChart(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const chart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          borderColor: '#d81f26',
          backgroundColor: 'rgba(216, 31, 38, 0.14)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#b9141a',
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(185, 20, 26, 0.08)' },
          ticks: { precision: 0 },
        },
      },
    },
  });
  chartRegistry.set(canvasId, chart);
}

export function renderBarChart(canvasId, labels, values, label) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const chart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: [
            '#d81f26',
            '#b9141a',
            '#f06767',
            '#f39a9a',
            '#921118',
            '#db4d4d',
            '#f7b1b1',
            '#ffcccc',
          ],
          borderRadius: 12,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(185, 20, 26, 0.08)' },
          ticks: { precision: 0 },
        },
      },
    },
  });
  chartRegistry.set(canvasId, chart);
}

export function renderHeatmap(container, rows) {
  if (!rows.length) {
    container.innerHTML = '<p class="inline-feedback">Nenhum dado para o heatmap.</p>';
    return;
  }

  const header = rows[0].cells.map((cell) => `<span>${cell.date.slice(5)}</span>`).join('');
  const maxCount = Math.max(...rows.flatMap((row) => row.cells.map((cell) => cell.count)), 1);
  container.innerHTML = `
    <div class="heatmap-row">
      <strong class="heatmap-machine">Maquina</strong>
      ${header}
    </div>
    ${rows
      .map(
        (row) => `
          <div class="heatmap-row">
            <span class="heatmap-machine">${row.machine_name}</span>
            ${row.cells
              .map((cell) => {
                const alpha = 0.15 + cell.count / maxCount * 0.85;
                const style = `background:rgba(216,31,38,${alpha.toFixed(2)});`;
                return `<span class="heatmap-cell" style="${style}">${cell.count}</span>`;
              })
              .join('')}
          </div>
        `
      )
      .join('')}
  `;
}
