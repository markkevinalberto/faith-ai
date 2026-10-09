/**
 * Time-proportional line chart (react-native-svg). X positions are true timestamps, so irregular
 * readings are placed accurately; ticks/labels come from tested domain code (chartScale.ts).
 */
import { useMemo, useState } from 'react';
import { View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { linearScale, niceYDomain, timeTicks } from '../domain/chartScale';
import type { ChartRange } from '../domain/stats';
import { AppText } from './Text';
import { SPACE, useTheme } from './theme';

export interface ChartPoint {
  t: number;
  v: number;
  /** Optional second series (e.g. diastolic). */
  v2?: number;
}

export interface TimeChartProps {
  points: ChartPoint[];
  range: ChartRange;
  window: { start: number; end: number };
  timeZone: string;
  locale: string;
  band?: { low: number | null; high: number | null } | null;
  band2?: { low: number | null; high: number | null } | null;
  formatY?: (v: number) => string;
  accessibilitySummary: string;
  height?: number;
  seriesLabels?: [string, string?];
}

const PAD = { l: 44, r: 12, t: 12, b: 30 };
/** Axis labels: 13 px keeps them legible for older readers without crowding a phone-width chart. */
const AXIS_FONT = 13;

export function TimeChart({ points, range, window, timeZone, locale, band, band2, formatY = (v) => String(Math.round(v)), accessibilitySummary, height = 210, seriesLabels }: TimeChartProps) {
  const { c } = useTheme();
  const screen = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  // Estimate from the screen (gutters + card padding) until onLayout reports the real width.
  const width = measured || Math.max(0, Math.round(Math.min(screen.width, 720) - SPACE.lg * 4));
  const onLayout = (e: LayoutChangeEvent) => setMeasured(Math.round(e.nativeEvent.layout.width));

  const model = useMemo(() => {
    if (width === 0) return null;
    const ys = points.flatMap((p) => (p.v2 !== undefined ? [p.v, p.v2] : [p.v]));
    const refs = [band?.low, band?.high, band2?.low, band2?.high].filter((v): v is number => typeof v === 'number');
    const yDom = niceYDomain(ys, refs, 4);
    const x = linearScale([window.start, window.end], [PAD.l, width - PAD.r]);
    const y = linearScale([yDom.min, yDom.max], [height - PAD.b, PAD.t]);
    const sorted = [...points].sort((a, b) => a.t - b.t);
    const path = (key: 'v' | 'v2') =>
      sorted
        .filter((p) => p[key] !== undefined)
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p[key] as number).toFixed(1)}`)
        .join(' ');
    const bandRect = (b: { low: number | null; high: number | null } | null | undefined) => {
      if (!b || (b.low === null && b.high === null)) return null;
      const top = y(Math.min(b.high ?? yDom.max, yDom.max));
      const bottom = y(Math.max(b.low ?? yDom.min, yDom.min));
      return { y: top, h: Math.max(0, bottom - top) };
    };
    return {
      x,
      y,
      yTicks: yDom.ticks,
      xTicks: timeTicks(range, window.start, window.end, timeZone, locale),
      line1: path('v'),
      line2: sorted.some((p) => p.v2 !== undefined) ? path('v2') : null,
      sorted,
      band1: bandRect(band),
      band2: bandRect(band2),
    };
  }, [width, points, band, band2, window.start, window.end, height, range, timeZone, locale]);

  const showDots = points.length <= 60;

  return (
    <View onLayout={onLayout} accessible accessibilityRole="image" accessibilityLabel={accessibilitySummary} style={{ height }}>
      {model && width > 0 ? (
        <Svg width={width} height={height}>
          {model.band1 ? <Rect x={PAD.l} y={model.band1.y} width={width - PAD.l - PAD.r} height={model.band1.h} fill={c.chartBand} /> : null}
          {model.band2 ? <Rect x={PAD.l} y={model.band2.y} width={width - PAD.l - PAD.r} height={model.band2.h} fill={c.chartBand} /> : null}
          {model.yTicks.map((t) => (
            <G key={`y${t}`}>
              <Line x1={PAD.l} x2={width - PAD.r} y1={model.y(t)} y2={model.y(t)} stroke={c.chartGrid} strokeWidth={1} />
              <SvgText x={PAD.l - 6} y={model.y(t) + 4.5} fontSize={AXIS_FONT} fill={c.textSubtle} textAnchor="end">
                {formatY(t)}
              </SvgText>
            </G>
          ))}
          {model.xTicks.map((t) => (
            <G key={`x${t.t}`}>
              <Line x1={model.x(t.t)} x2={model.x(t.t)} y1={PAD.t} y2={height - PAD.b} stroke={c.chartGrid} strokeWidth={1} strokeDasharray="2,4" />
              <SvgText x={model.x(t.t)} y={height - 9} fontSize={AXIS_FONT} fill={c.textSubtle} textAnchor="middle">
                {t.label}
              </SvgText>
            </G>
          ))}
          {model.line2 ? <Path d={model.line2} stroke={c.chartSecondary} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {model.line1 ? <Path d={model.line1} stroke={c.chartLine} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
          {showDots
            ? model.sorted.map((p, i) => (
                <G key={`p${i}`}>
                  {p.v2 !== undefined ? <Circle cx={model.x(p.t)} cy={model.y(p.v2)} r={3} fill={c.surface} stroke={c.chartSecondary} strokeWidth={2} /> : null}
                  <Circle cx={model.x(p.t)} cy={model.y(p.v)} r={3.5} fill={c.surface} stroke={c.chartLine} strokeWidth={2} />
                </G>
              ))
            : null}
        </Svg>
      ) : null}
      {points.length === 0 ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: height / 2 - 12, alignItems: 'center' }}>
          <AppText variant="caption" tone="subtle">
            No readings in this period
          </AppText>
        </View>
      ) : null}
      {seriesLabels?.[1] && points.length > 0 ? (
        <View style={{ position: 'absolute', right: PAD.r, top: 0, flexDirection: 'row', gap: SPACE.md }}>
          <Legend color={c.chartLine} label={seriesLabels[0]} />
          <Legend color={c.chartSecondary} label={seriesLabels[1]} />
        </View>
      ) : null}
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: color }} />
      <AppText variant="caption" tone="subtle" style={{ fontSize: 13, lineHeight: 18 }}>
        {label}
      </AppText>
    </View>
  );
}
