import { getState } from './state.js';

function formatNumber(value, digits = 2) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function getMetricMode() {
  return getState().metricMode === 'meq' ? 'meq' : 'estacas';
}

export function getMetricConfig() {
  const mode = getMetricMode();
  if (mode === 'meq') {
    return {
      mode,
      label: 'MEQ',
      longLabel: 'Metros equivalentes',
      shortLabel: 'MEQ',
      machineKey: 'realized_meq',
      totalKey: 'total_realized_meq',
      dayKey: 'realized_meq',
      accumulatedKey: 'accumulated_meq',
      decimals: 2,
      isCountMetric: false,
    };
  }

  return {
    mode,
    label: 'estacas',
    longLabel: 'Estacas',
    shortLabel: 'Estacas',
    machineKey: 'realized_estacas',
    totalKey: 'total_realized_estacas',
    dayKey: 'realized_estacas',
    accumulatedKey: 'accumulated_estacas',
    decimals: 0,
    isCountMetric: true,
  };
}

export function pickMetric(item, config = getMetricConfig()) {
  return Number(item?.[config.machineKey] || item?.[config.dayKey] || item?.[config.totalKey] || 0);
}

export function formatMetric(value, config = getMetricConfig(), digits = 2) {
  return `${formatNumber(value, config.decimals ?? digits)} ${config.label}`;
}
