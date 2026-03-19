import { api } from './api.js';
import { getState, getWeekStartFromInput } from './state.js';
import { renderBarChart, renderHeatmap } from './charts.js';

function machineRankCard(item, index) {
  return `
    <article class="rank-card">
      <div class="rank-order">${index + 1}</div>
      <div>
        <strong>${item.machine_name}</strong>
        <p>${item.obra_name || 'Sem obra'}</p>
      </div>
      <strong>${item.realized_estacas}</strong>
    </article>
  `;
}

function alertCard(item) {
  return `
    <article class="alert-card warning">
      <strong>${item.machine_name}</strong>
      <p>${item.message}</p>
    </article>
  `;
}

function timelineCard(item) {
  return `
    <article class="timeline-card">
      <div class="timeline-time">${item.date} ${item.finishedAt || '--:--'}</div>
      <div>
        <strong>${item.machine_name}</strong>
        <p>${item.estaca || 'Sem estaca'} | ${item.obra_name || 'Sem obra'}</p>
      </div>
    </article>
  `;
}

export async function renderSecondaryView() {
  const state = getState();
  const data = await api.getSecondary({
    clientLogin: state.clientLogin,
    date: state.date,
    weekStart: getWeekStartFromInput(state.weekInput),
  });

  document.getElementById('secondaryMeta').textContent = `${data.item.today_total_estacas} hoje / ${data.item.week_total_estacas} semana`;
  document.getElementById('secondaryMachines').innerHTML = data.item.top_machines.length
    ? data.item.top_machines.map(machineRankCard).join('')
    : '<p class="inline-feedback">Nenhuma maquina no ranking.</p>';
  document.getElementById('secondaryAlerts').innerHTML = data.item.alerts.length
    ? data.item.alerts.map(alertCard).join('')
    : '<p class="inline-feedback">Nenhum alerta operacional.</p>';
  document.getElementById('secondaryTimeline').innerHTML = data.item.timeline.length
    ? data.item.timeline.map(timelineCard).join('')
    : '<p class="inline-feedback">Nenhuma timeline disponivel.</p>';

  renderBarChart(
    'secondaryWorksChart',
    data.item.top_works.map((item) => item.obra_name),
    data.item.top_works.map((item) => item.realized_estacas),
    'Obras'
  );
  renderHeatmap(document.getElementById('secondaryHeatmap'), data.item.heatmap);

  return data;
}
