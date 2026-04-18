import { personaColorList } from './personas';

export const chartColors = {
  focal: '#00e5ff',
  hero: '#f5f500',
  context: ['#ffffff', '#888888', '#333333', '#1a1a1a'],
  persona: personaColorList,
  grid: '#1a1a1a',
  axis: '#444444',
};

export const brutalAxis = {
  stroke: chartColors.axis,
  tick: {
    fontFamily: 'Geist Variable',
    fontSize: 9,
    fill: chartColors.axis,
    letterSpacing: '0.06em',
  } as const,
  tickLine: false,
  axisLine: { stroke: chartColors.axis, strokeWidth: 1 },
};

export const brutalGrid = {
  stroke: chartColors.grid,
  strokeDasharray: '1 3',
  vertical: false,
};
