function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function clampPercent(value) {
  return Math.max(0, Math.min(999, Number(value) || 0));
}

function progress(realized, goal) {
  if (!goal) return null;
  return clampPercent((realized / goal) * 100);
}

function expectedAccumulated(totalGoal, totalDays, currentIndex) {
  if (!totalGoal || !totalDays) return 0;
  return Number(((totalGoal / totalDays) * (currentIndex + 1)).toFixed(2));
}

function resolveWorkInfo(mapping, summaries) {
  const operatorObraCode = topLabel(summaries, "obra");
  const operatorObraName = topLabel(summaries, "contrato");
  const adminObraCode = String(mapping.obra_code || "").trim();
  const adminObraNameRaw = String(mapping.obra_name || "").trim();
  const adminObraName = adminObraNameRaw === "Obra nao definida" ? "" : adminObraNameRaw;

  const obra_code = adminObraCode || (operatorObraCode !== "Nao informado" ? operatorObraCode : "");
  const obra_name = adminObraName || (operatorObraName !== "Nao informado" ? operatorObraName : "Sem obra");

  return {
    obra_code,
    obra_name,
    operator_obra_code: operatorObraCode,
    operator_obra_name: operatorObraName,
    source: adminObraCode || adminObraName ? "admin" : (operatorObraCode !== "Nao informado" || operatorObraName !== "Nao informado" ? "api" : "none"),
  };
}

function topLabel(items, field) {
  const counts = new Map();

  for (const item of items) {
    const label = String(item[field] || "").trim() || "Nao informado";
    counts.set(label, (counts.get(label) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "Nao informado";
}

function flatten(list) {
  return list.reduce((acc, item) => acc.concat(item), []);
}

function sortTimeline(items) {
  return [...items].sort((a, b) =>
    `${a.date || ""} ${a.finishedAt || ""}`.localeCompare(`${b.date || ""} ${b.finishedAt || ""}`)
  );
}

function metricTotals(summaries) {
  return {
    linear: sum(summaries.map((item) => item.realizadoLinearM || item.realizadoM || 0)),
    meq: sum(summaries.map((item) => item.realizadoMeq || 0)),
  };
}

async function buildDailyDashboard({ mappings, date, loadSummaries }) {
  const machineRows = [];
  const timeline = [];

  for (const mapping of mappings) {
    const summaries = await loadSummaries(mapping.imei, date);
    const realizedEstacas = summaries.length;
    const totals = metricTotals(summaries);
    const workInfo = resolveWorkInfo(mapping, summaries);

    machineRows.push({
      imei: mapping.imei,
      machine_name: mapping.machine_name,
      obra_code: workInfo.obra_code,
      obra_name: workInfo.obra_name,
      operator_obra_code: workInfo.operator_obra_code,
      operator_obra_name: workInfo.operator_obra_name,
      work_source: workInfo.source,
      daily_goal_estacas: Number(mapping.daily_goal_estacas || 0),
      weekly_goal_estacas: Number(mapping.weekly_goal_estacas || 0),
      realized_estacas: realizedEstacas,
      realized_meters: Number(totals.linear.toFixed(2)),
      realized_linear_meters: Number(totals.linear.toFixed(2)),
      realized_meq: Number(totals.meq.toFixed(2)),
      progress_percent: progress(realizedEstacas, mapping.daily_goal_estacas),
      active: Boolean(mapping.active),
      alerts: [
        realizedEstacas === 0 ? "Sem estacas registradas no dia." : null,
        !Number(mapping.daily_goal_estacas || 0) ? "Meta diaria nao cadastrada." : null,
      ].filter(Boolean),
    });

    timeline.push(
      ...summaries.map((item) => ({
        date,
        finishedAt: item.finishedAt,
        machine_name: mapping.machine_name,
        imei: mapping.imei,
        obra_name: workInfo.obra_name,
        obra_code: workInfo.obra_code,
        operator_obra_name: item.obra,
        estaca: item.estaca,
        contrato: item.contrato,
        diametro_cm: item.diametroCm,
        realized_linear_meters: Number(item.realizadoLinearM || item.realizadoM || 0),
        realized_meq: Number(item.realizadoMeq || 0),
      }))
    );
  }

  const sortedMachines = [...machineRows].sort((a, b) => b.realized_estacas - a.realized_estacas);
  const totalRealized = sum(machineRows.map((item) => item.realized_estacas));
  const totalGoal = sum(machineRows.map((item) => item.daily_goal_estacas));
  const totalLinearMeters = sum(machineRows.map((item) => item.realized_linear_meters || 0));
  const totalMeq = sum(machineRows.map((item) => item.realized_meq || 0));
  const byWork = new Map();

  for (const row of machineRows) {
    const current = byWork.get(row.obra_name) || {
      obra_name: row.obra_name,
      realized_estacas: 0,
      goal_estacas: 0,
      realized_linear_meters: 0,
      realized_meq: 0,
    };
    current.realized_estacas += row.realized_estacas;
    current.goal_estacas += row.daily_goal_estacas;
    current.realized_linear_meters += row.realized_linear_meters || 0;
    current.realized_meq += row.realized_meq || 0;
    byWork.set(row.obra_name, current);
  }

  return {
    date,
    total_realized_estacas: totalRealized,
    total_goal_estacas: totalGoal,
    total_realized_linear_meters: Number(totalLinearMeters.toFixed(2)),
    total_realized_meq: Number(totalMeq.toFixed(2)),
    total_progress_percent: progress(totalRealized, totalGoal),
    machines: sortedMachines,
    top_works: [...byWork.values()]
      .sort((a, b) => b.realized_linear_meters - a.realized_linear_meters)
      .slice(0, 8)
      .map((item) => ({
        ...item,
        realized_linear_meters: Number(item.realized_linear_meters.toFixed(2)),
        realized_meq: Number(item.realized_meq.toFixed(2)),
      })),
    ranking: sortedMachines.slice(0, 8),
    timeline: sortTimeline(timeline),
    generated_at: new Date().toISOString(),
  };
}

async function buildWeeklyDashboard({ mappings, weekDates, weekStart, loadSummaries }) {
  const machineRows = [];
  const timelineByMachine = [];

  for (const mapping of mappings) {
    const daily = [];
    const allSummaries = [];

    for (const date of weekDates) {
      const summaries = await loadSummaries(mapping.imei, date);
      const totals = metricTotals(summaries);
      allSummaries.push(...summaries.map((item) => ({ ...item, date })));
      daily.push({
        date,
        realized_estacas: summaries.length,
        realized_meters: Number(totals.linear.toFixed(2)),
        realized_linear_meters: Number(totals.linear.toFixed(2)),
        realized_meq: Number(totals.meq.toFixed(2)),
      });
    }

    const realizedEstacas = sum(daily.map((item) => item.realized_estacas));
    const realizedLinearMeters = sum(daily.map((item) => item.realized_linear_meters));
    const realizedMeq = sum(daily.map((item) => item.realized_meq));
    const workInfo = resolveWorkInfo(mapping, allSummaries);

    machineRows.push({
      imei: mapping.imei,
      machine_name: mapping.machine_name,
      obra_code: workInfo.obra_code,
      obra_name: workInfo.obra_name,
      operator_obra_code: workInfo.operator_obra_code,
      operator_obra_name: workInfo.operator_obra_name,
      work_source: workInfo.source,
      daily_goal_estacas: Number(mapping.daily_goal_estacas || 0),
      weekly_goal_estacas: Number(mapping.weekly_goal_estacas || 0),
      realized_estacas: realizedEstacas,
      realized_meters: Number(realizedLinearMeters.toFixed(2)),
      realized_linear_meters: Number(realizedLinearMeters.toFixed(2)),
      realized_meq: Number(realizedMeq.toFixed(2)),
      progress_percent: progress(realizedEstacas, mapping.weekly_goal_estacas),
      active: Boolean(mapping.active),
      daily,
      alerts: [
        realizedEstacas === 0 ? "Sem producao na semana." : null,
        !Number(mapping.weekly_goal_estacas || 0) ? "Meta semanal nao cadastrada." : null,
      ].filter(Boolean),
    });

    timelineByMachine.push(
      ...allSummaries.map((item) => ({
        date: item.date,
        finishedAt: item.finishedAt,
        machine_name: mapping.machine_name,
        imei: mapping.imei,
        obra_name: workInfo.obra_name,
        obra_code: workInfo.obra_code,
        operator_obra_name: item.obra,
        estaca: item.estaca,
        contrato: item.contrato,
        diametro_cm: item.diametroCm,
        realized_linear_meters: Number(item.realizadoLinearM || item.realizadoM || 0),
        realized_meq: Number(item.realizadoMeq || 0),
      }))
    );
  }

  const sortedMachines = [...machineRows].sort((a, b) => b.realized_estacas - a.realized_estacas);
  const totalRealized = sum(machineRows.map((item) => item.realized_estacas));
  const totalGoal = sum(machineRows.map((item) => item.weekly_goal_estacas));
  const totalLinearMeters = sum(machineRows.map((item) => item.realized_linear_meters || 0));
  const totalMeq = sum(machineRows.map((item) => item.realized_meq || 0));
  const byDay = weekDates.map((date) => ({
    date,
    realized_estacas: sum(machineRows.map((item) => item.daily.find((day) => day.date === date)?.realized_estacas || 0)),
    realized_linear_meters: sum(machineRows.map((item) => item.daily.find((day) => day.date === date)?.realized_linear_meters || 0)),
    realized_meq: sum(machineRows.map((item) => item.daily.find((day) => day.date === date)?.realized_meq || 0)),
  }));

  return {
    week_start: weekStart,
    week_dates: weekDates,
    total_realized_estacas: totalRealized,
    total_goal_estacas: totalGoal,
    total_realized_linear_meters: Number(totalLinearMeters.toFixed(2)),
    total_realized_meq: Number(totalMeq.toFixed(2)),
    total_progress_percent: progress(totalRealized, totalGoal),
    machines: sortedMachines,
    ranking: sortedMachines.slice(0, 8),
    accumulated_by_day: byDay.map((item, index) => ({
      ...item,
      accumulated_estacas: sum(byDay.slice(0, index + 1).map((row) => row.realized_estacas)),
      accumulated_linear_meters: Number(sum(byDay.slice(0, index + 1).map((row) => row.realized_linear_meters)).toFixed(2)),
      accumulated_meq: Number(sum(byDay.slice(0, index + 1).map((row) => row.realized_meq)).toFixed(2)),
      expected_accumulated_estacas: expectedAccumulated(totalGoal, weekDates.length, index),
    })),
    timeline: sortTimeline(timelineByMachine).slice(0, 30),
    generated_at: new Date().toISOString(),
  };
}

function buildSecondaryDashboard({ dailyDashboard, weeklyDashboard }) {
  const topWorks = new Map();
  const alerts = [];

  for (const machine of weeklyDashboard.machines) {
    const work = machine.obra_name || "Sem obra";
    const current = topWorks.get(work) || {
      obra_name: work,
      realized_estacas: 0,
      goal_estacas: 0,
      realized_linear_meters: 0,
      realized_meq: 0,
      machines: 0,
    };
    current.realized_estacas += machine.realized_estacas;
    current.goal_estacas += machine.weekly_goal_estacas;
    current.realized_linear_meters += machine.realized_linear_meters || 0;
    current.realized_meq += machine.realized_meq || 0;
    current.machines += 1;
    topWorks.set(work, current);

    if (machine.alerts.length) {
      for (const alert of machine.alerts) {
        alerts.push({
          machine_name: machine.machine_name,
          obra_name: machine.obra_name,
          message: alert,
        });
      }
    }
  }

  const heatmap = weeklyDashboard.machines.map((machine) => ({
    machine_name: machine.machine_name,
    obra_name: machine.obra_name,
    cells: machine.daily.map((day) => ({
      date: day.date,
      count: day.realized_estacas,
    })),
  }));

  const dailyRealizedByDay = weeklyDashboard.accumulated_by_day.map((day) => ({
    date: day.date,
    realized_estacas: day.realized_estacas,
    realized_linear_meters: day.realized_linear_meters,
    realized_meq: day.realized_meq,
    goal_estacas: dailyDashboard.total_goal_estacas,
  }));

  return {
    today_total_estacas: dailyDashboard.total_realized_estacas,
    week_total_estacas: weeklyDashboard.total_realized_estacas,
    today_total_linear_meters: dailyDashboard.total_realized_linear_meters,
    today_total_meq: dailyDashboard.total_realized_meq,
    week_total_linear_meters: weeklyDashboard.total_realized_linear_meters,
    week_total_meq: weeklyDashboard.total_realized_meq,
    week_dates: weeklyDashboard.week_dates,
    daily_goal_estacas_total: dailyDashboard.total_goal_estacas,
    daily_realized_by_day: dailyRealizedByDay,
    top_machines: weeklyDashboard.ranking,
    top_works: [...topWorks.values()].sort((a, b) => b.realized_estacas - a.realized_estacas).slice(0, 8),
    alerts: alerts.slice(0, 12),
    heatmap,
    timeline: weeklyDashboard.timeline.slice(0, 16),
    expected_accumulated_by_day: weeklyDashboard.accumulated_by_day.map((day) => ({
      date: day.date,
      expected_accumulated_estacas: day.expected_accumulated_estacas,
      accumulated_estacas: day.accumulated_estacas,
    })),
  };
}

module.exports = {
  buildDailyDashboard,
  buildWeeklyDashboard,
  buildSecondaryDashboard,
};
