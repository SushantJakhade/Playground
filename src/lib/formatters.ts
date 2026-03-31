import { MetricRecord, TableColumn } from '../types';

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});

const currencyCompactFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatMetricValue(metric: MetricRecord): string {
  if (metric.unit === 'percent') {
    return `${metric.value}%`;
  }

  if (metric.unit === 'currency') {
    return metric.value >= 100_000
      ? currencyCompactFormatter.format(metric.value)
      : currencyFormatter.format(metric.value);
  }

  if (metric.unit === 'days') {
    return `${metric.value}d`;
  }

  return metric.value >= 1000 ? compactFormatter.format(metric.value) : `${metric.value}`;
}

export function formatDelta(metric: MetricRecord): string {
  const sign = metric.delta > 0 ? '+' : '';

  if (metric.unit === 'percent') {
    return `${sign}${metric.delta}%`;
  }

  if (metric.unit === 'days') {
    return `${sign}${metric.delta}d`;
  }

  return `${sign}${metric.delta}`;
}

export function formatCellValue(
  value: string | number,
  column: TableColumn,
): string {
  if (typeof value === 'string') {
    return value;
  }

  switch (column.format) {
    case 'percent':
      return `${value}%`;
    case 'currency':
      return currencyFormatter.format(value);
    case 'days':
      return `${value}d`;
    case 'number':
      return value >= 1000 ? compactFormatter.format(value) : `${value}`;
    default:
      return `${value}`;
  }
}
