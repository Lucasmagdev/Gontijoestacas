import { api } from './api.js';

function feedback(message, tone = 'neutral') {
  const node = document.getElementById('mappingFeedback');
  node.textContent = message;
  node.className = 'inline-feedback';
  if (tone === 'error') node.style.color = '#b9141a';
  if (tone === 'success') node.style.color = '#0f8b4c';
}

function loginFeedback(message, tone = 'neutral') {
  const node = document.getElementById('adminLoginFeedback');
  node.textContent = message;
  node.className = 'inline-feedback';
  if (tone === 'error') node.style.color = '#b9141a';
  if (tone === 'success') node.style.color = '#0f8b4c';
}

function mappingRow(item) {
  const status = item.active ? 'Ativo' : 'Historico';
  return `
    <tr>
      <td>
        <strong>${item.machine_name}</strong><br />
        <small>${item.updated_at ? new Date(item.updated_at).toLocaleString('pt-BR') : '-'}</small>
      </td>
      <td>${item.imei}</td>
      <td>
        <strong>${item.obra_name || '-'}</strong><br />
        <small>${item.obra_code || '-'}</small>
      </td>
      <td>${item.daily_goal_estacas}</td>
      <td>${item.weekly_goal_estacas}</td>
      <td><span class="status-tag ${item.active ? 'green' : 'neutral'}">${status}</span></td>
      <td>
        <div class="table-actions">
          <button class="mini-button" type="button" data-action="edit" data-id="${item.id}">Editar</button>
          ${item.active ? '' : `<button class="mini-button" type="button" data-action="activate" data-id="${item.id}">Ativar</button>`}
          ${item.active ? `<button class="mini-button" type="button" data-action="archive" data-id="${item.id}">Encerrar</button>` : ''}
        </div>
      </td>
    </tr>
  `;
}

function machineOption(item) {
  const selected = item.active_mapping;
  return `<option value="${item.imei}" data-machine-name="${selected?.machine_name || item.machine_name}">
    ${selected?.machine_name || item.machine_name} | ${item.imei}
  </option>`;
}

function fillForm(item) {
  document.getElementById('mappingIdInput').value = item?.id || '';
  document.getElementById('mappingImeiInput').value = item?.imei || '';
  document.getElementById('mappingMachineNameInput').value = item?.machine_name || '';
  document.getElementById('mappingObraCodeInput').value = item?.obra_code || '';
  document.getElementById('mappingObraNameInput').value = item?.obra_name || '';
  document.getElementById('mappingDailyGoalInput').value = item?.daily_goal_estacas ?? 0;
  document.getElementById('mappingWeeklyGoalInput').value = item?.weekly_goal_estacas ?? 0;
  document.getElementById('mappingActiveInput').checked = item?.active ?? true;
}

export async function initAdminModule() {
  const loginCard = document.getElementById('adminLoginCard');
  const panel = document.getElementById('adminPanel');
  const modeLabel = document.getElementById('adminModeLabel');
  const includeInactiveInput = document.getElementById('includeInactiveInput');
  const mappingTableBody = document.getElementById('mappingTableBody');
  const machineSelect = document.getElementById('machineSelect');

  let currentMappings = [];

  async function refreshAdmin() {
    const status = await api.getAdminStatus();
    modeLabel.textContent = status.mode === 'supabase' ? 'Supabase' : 'Modo local';
    if (!status.authenticated) {
      loginCard.classList.remove('is-hidden');
      panel.classList.add('is-hidden');
      return;
    }

    loginCard.classList.add('is-hidden');
    panel.classList.remove('is-hidden');

    const [machinesResponse, mappingsResponse] = await Promise.all([
      api.getAdminMachines(),
      api.getAdminMappings(includeInactiveInput.checked),
    ]);

    currentMappings = mappingsResponse.items;
    machineSelect.innerHTML = machinesResponse.items.map(machineOption).join('');
    mappingTableBody.innerHTML = currentMappings.length
      ? currentMappings.map(mappingRow).join('')
      : '<tr><td colspan="7">Nenhum vinculo cadastrado.</td></tr>';
    fillForm(null);
    feedback('Area admin carregada.', 'success');
  }

  document.getElementById('adminLoginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await api.loginAdmin(document.getElementById('adminPasswordInput').value);
      loginFeedback('Autenticacao realizada com sucesso.', 'success');
      await refreshAdmin();
    } catch (error) {
      loginFeedback(error.message, 'error');
    }
  });

  document.getElementById('adminLogoutButton').addEventListener('click', async () => {
    await api.logoutAdmin();
    loginFeedback('Sessao encerrada.');
    await refreshAdmin();
  });

  includeInactiveInput.addEventListener('change', refreshAdmin);

  machineSelect.addEventListener('change', () => {
    const option = machineSelect.selectedOptions[0];
    document.getElementById('mappingImeiInput').value = machineSelect.value;
    document.getElementById('mappingMachineNameInput').value = option?.dataset.machineName || '';
  });

  document.getElementById('mappingResetButton').addEventListener('click', () => {
    fillForm(null);
    feedback('Formulario limpo.');
  });

  document.getElementById('mappingForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const id = document.getElementById('mappingIdInput').value;
    const payload = {
      imei: document.getElementById('mappingImeiInput').value,
      machine_name: document.getElementById('mappingMachineNameInput').value,
      obra_code: document.getElementById('mappingObraCodeInput').value,
      obra_name: document.getElementById('mappingObraNameInput').value,
      daily_goal_estacas: Number(document.getElementById('mappingDailyGoalInput').value || 0),
      weekly_goal_estacas: Number(document.getElementById('mappingWeeklyGoalInput').value || 0),
      active: document.getElementById('mappingActiveInput').checked,
    };

    try {
      if (id) {
        await api.updateMapping(id, payload);
        feedback('Vinculo atualizado.', 'success');
      } else {
        await api.createMapping(payload);
        feedback('Vinculo criado.', 'success');
      }
      await refreshAdmin();
    } catch (error) {
      feedback(error.message, 'error');
    }
  });

  mappingTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const item = currentMappings.find((mapping) => String(mapping.id) === String(id));
    if (!item) return;

    try {
      if (button.dataset.action === 'edit') {
        fillForm(item);
        feedback(`Editando ${item.machine_name}.`);
      }
      if (button.dataset.action === 'activate') {
        await api.activateMapping(id);
        await refreshAdmin();
        feedback('Vinculo ativado.', 'success');
      }
      if (button.dataset.action === 'archive') {
        await api.archiveMapping(id);
        await refreshAdmin();
        feedback('Vinculo encerrado.', 'success');
      }
    } catch (error) {
      feedback(error.message, 'error');
    }
  });

  await refreshAdmin();
  return { refreshAdmin };
}
