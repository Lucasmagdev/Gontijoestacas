import { api } from './api.js';
import { getFriendlyWeekRange, getState, getWeekStartFromInput } from './state.js';
import { renderBuildingCard, renderLineChart } from './charts.js';

function toneClass(machine) {
  if (machine.progress_percent == null) return 'neutral';
  if (machine.progress_percent >= 100) return 'green';
  if (machine.progress_percent >= 70) return 'orange';
  return 'red';
}

function rankingCard(machine, index) {
  return `
    <article class="rank-card">
      <div class="rank-order">${index + 1}</div>
      <div>
        <strong>${machine.machine_name}</strong>
        <p>${machine.obra_name || 'Sem obra'}</p>
      </div>
      <strong>${machine.realized_estacas}</strong>
    </article>
  `;
}

function machineCard(machine) {
  const percent = machine.progress_percent == null ? 0 : Math.min(machine.progress_percent, 100);
  const sourceLabel =
    machine.work_source === 'admin'
      ? 'Obra definida no admin'
      : machine.work_source === 'api'
      ? 'Obra puxada da operacao'
      : 'Sem obra definida';
  return `
    <article class="machine-card">
      <div class="machine-top">
        <div class="machine-meta">
          <strong>${machine.machine_name}</strong>
          <small>${machine.imei}</small>
          <small>${machine.obra_name || 'Sem obra'}</small>
          <small>${sourceLabel}</small>
        </div>
        <span class="status-tag ${toneClass(machine)}">
          ${machine.progress_percent == null ? 'Sem meta' : `${machine.progress_percent.toFixed(0)}%`}
        </span>
      </div>
      <div class="machine-progress"><span style="width:${percent}%"></span></div>
      <div class="machine-stats">
        <div><span>Semana</span><strong>${machine.realized_estacas}</strong></div>
        <div><span>Meta</span><strong>${machine.weekly_goal_estacas}</strong></div>
        <div><span>Media/dia</span><strong>${(machine.realized_estacas / 7).toFixed(1)}</strong></div>
      </div>
    </article>
  `;
}

export async function renderWeeklyView() {
  const state = getState();
  const weekStart = getWeekStartFromInput(state.weekInput);
  const data = await api.getWeekly({
    clientLogin: state.clientLogin,
    weekStart,
  });

  document.getElementById('weeklyRangeLabel').textContent = getFriendlyWeekRange(state.weekInput);
  document.getElementById('weeklyMachinesCount').textContent = `${data.machines.length} maquinas`;

  const hero = document.getElementById('weeklyHero');
  hero.innerHTML = `
    <div id="weeklyBuildingMain"></div>
    <div id="weeklyBuildingGoal"></div>
    <article class="hero-card">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Consolidado</p>
          <h3>Ritmo da semana</h3>
        </div>
        <span>${data.week_dates.length} dias</span>
      </div>
      <div class="summary-strip">
        ${data.accumulated_by_day
          .map(
            (day) => `
              <div class="summary-chip">
                <span>${day.date.slice(5)}</span>
                <strong>${day.accumulated_estacas}</strong>
              </div>
            `
          )
          .join('')}
      </div>
    </article>
  `;

  renderBuildingCard(document.getElementById('weeklyBuildingMain'), {
    eyebrow: 'Principal',
    title: 'Estacas acumuladas na semana',
    realized: data.total_realized_estacas,
    goal: data.total_goal_estacas,
    percent: data.total_progress_percent,
    description: 'Consolidado semanal do volume executado pelas maquinas ativas.',
    accent: true,
  });

  renderBuildingCard(document.getElementById('weeklyBuildingGoal'), {
    eyebrow: 'Meta semanal',
    title: 'Meta consolidada da semana',
    realized: data.total_goal_estacas,
    goal: data.total_goal_estacas,
    percent: data.total_goal_estacas ? 100 : null,
    description: 'Meta semanal definida no cadastro administrativo da obra atual.',
  });

  renderLineChart(
    'weeklyTrendChart',
    data.accumulated_by_day.map((item) => item.date.slice(5)),
    data.accumulated_by_day.map((item) => item.accumulated_estacas),
    'Acumulado semanal'
  );

  document.getElementById('weeklyRanking').innerHTML = data.ranking.length
    ? data.ranking.map(rankingCard).join('')
    : '<p class="inline-feedback">Nenhum ranking disponivel.</p>';

  document.getElementById('weeklyMachineCards').innerHTML = data.machines.map(machineCard).join('');

  return data;
}
