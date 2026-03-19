import { api } from './api.js';
import { getState } from './state.js';
import { renderBuildingCard } from './charts.js';

function toneClass(machine) {
  if (machine.progress_percent == null) return 'neutral';
  if (machine.progress_percent >= 100) return 'green';
  if (machine.progress_percent >= 70) return 'orange';
  return 'red';
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
        <div><span>Estacas</span><strong>${machine.realized_estacas}</strong></div>
        <div><span>Meta dia</span><strong>${machine.daily_goal_estacas}</strong></div>
        <div><span>Numero obra</span><strong>${machine.obra_code || '-'}</strong></div>
      </div>
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

export async function renderDailyView() {
  const state = getState();
  const data = await api.getDaily({
    clientLogin: state.clientLogin,
    date: state.date,
  });

  document.getElementById('dailyDateLabel').textContent = new Date(`${data.date}T00:00:00`).toLocaleDateString('pt-BR');
  document.getElementById('dailyMachinesCount').textContent = `${data.machines.length} maquinas`;

  const hero = document.getElementById('dailyHero');
  hero.innerHTML = `
    <div id="dailyBuildingMain"></div>
    <div id="dailyBuildingGoal"></div>
    <article class="hero-card">
      <div class="panel-head">
        <div>
          <p class="eyebrow">Resumo</p>
          <h3>Obras em destaque</h3>
        </div>
        <span>${data.top_works.length} obras</span>
      </div>
      <div class="ranking-list">
        ${data.top_works
          .slice(0, 4)
          .map(
            (work, index) => `
              <article class="rank-card">
                <div class="rank-order">${index + 1}</div>
                <div>
                  <strong>${work.obra_name}</strong>
                  <p>${work.realized_estacas} estacas hoje</p>
                </div>
                <strong>${work.goal_estacas || 0}</strong>
              </article>
            `
          )
          .join('')}
      </div>
    </article>
  `;

  renderBuildingCard(document.getElementById('dailyBuildingMain'), {
    eyebrow: 'Principal',
    title: 'Estacas realizadas no dia',
    realized: data.total_realized_estacas,
    goal: data.total_goal_estacas,
    percent: data.total_progress_percent,
    description: 'Painel principal para acompanhar o total executado no dia frente a meta diaria consolidada.',
    accent: true,
  });

  renderBuildingCard(document.getElementById('dailyBuildingGoal'), {
    eyebrow: 'Meta diaria',
    title: 'Meta consolidada do dia',
    realized: data.total_goal_estacas,
    goal: data.total_goal_estacas,
    percent: data.total_goal_estacas ? 100 : null,
    description: 'Meta do conjunto de maquinas ativas cadastradas na area administrativa.',
  });

  document.getElementById('dailyMachineCards').innerHTML = data.machines.map(machineCard).join('');
  document.getElementById('dailyTimeline').innerHTML = data.timeline.length
    ? data.timeline.map(timelineCard).join('')
    : '<p class="inline-feedback">Nenhum evento registrado para o dia selecionado.</p>';

  return data;
}
