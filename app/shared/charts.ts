export const W = 640;
export const H = 220;
export const PAD = { top: 14, right: 18, bottom: 26, left: 44 };
export const PLOT_W = W - PAD.left - PAD.right;
export const PLOT_H = H - PAD.top - PAD.bottom;

export interface Tick {
  id: string;
  value: number;
  y: number;
  label: string;
}

export interface XLabel {
  id: string;
  x: number;
  label: string;
}

export type Scale = "count" | "seconds" | "minutes";

const TIME_STEPS: Record<"seconds" | "minutes", number[]> = {
  seconds: [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600],
  minutes: [5, 10, 15, 30, 60, 120, 180, 240, 360, 720, 1440],
};

export const TICK_COUNT = 4;

/**
 * A tick step that reads cleanly in the axis unit: 1, 2, 5, 10 for counts,
 * whole minutes and hours for durations.
 */
export function niceStep(max: number, scale: Scale = "count"): number {
  let rough = Math.max(max, 1) / TICK_COUNT;

  if (scale !== "count") {
    return TIME_STEPS[scale].find((s) => s >= rough) ?? TIME_STEPS[scale].at(-1)!;
  }

  let magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  let step = [1, 2, 5, 10].find((s) => s * magnitude >= rough) ?? 10;

  return Math.max(1, step * magnitude);
}

/**
 * The top of the axis: four clean steps that clear the largest value.
 */
export function niceMax(value: number, scale: Scale = "count"): number {
  return niceStep(value, scale) * TICK_COUNT;
}

export function yScale(min: number, max: number): (v: number) => number {
  return (v) => PAD.top + PLOT_H - ((v - min) / (max - min || 1)) * PLOT_H;
}

export function ticks(min: number, max: number, count: number, format: (v: number) => string): Tick[] {
  let y = yScale(min, max);
  let list: Tick[] = [];

  for (let i = 0; i <= count; i++) {
    let value = min + ((max - min) * i) / count;
    list.push({ id: `t${i}`, value, y: y(value), label: format(value) });
  }

  return list;
}

export function band(count: number): number {
  return PLOT_W / Math.max(count, 1);
}

export function bandCenter(i: number, count: number): number {
  return PAD.left + band(count) * (i + 0.5);
}

export function shortDay(date: Date): string {
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * A label every week, counted back from today so the newest day is labelled.
 */
export function dayLabels(days: Date[]): XLabel[] {
  let list: XLabel[] = [];

  for (let i = days.length - 1; i >= 0; i -= 7) {
    list.push({ id: `x${i}`, x: bandCenter(i, days.length), label: shortDay(days[i]) });
  }

  return list;
}

/**
 * A column with a 4px rounded data end and a square foot on the baseline.
 */
export function columnPath(x: number, y: number, w: number, h: number, rounded: boolean): string {
  if (h <= 0) {
    return "";
  }

  let r = rounded ? Math.min(4, w / 2, h) : 0;

  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

/**
 * A 2px line through the values, broken where a day has no value.
 */
export function linePath(values: (number | null)[], y: (v: number) => number): string {
  let d = "";
  let pen = false;

  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }

    d += `${pen ? "L" : "M"}${bandCenter(i, values.length).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });

  return d.trim();
}

/**
 * The wash under the line, one closed shape per unbroken run.
 */
export function areaPath(values: (number | null)[], y: (v: number) => number, base: number): string {
  let d = "";
  let run: string[] = [];
  let first = 0;
  let last = 0;

  let close = () => {
    if (run.length > 1) {
      d += `M${first.toFixed(1)},${base} L${run.join(" L")} L${last.toFixed(1)},${base} Z `;
    }

    run = [];
  };

  values.forEach((v, i) => {
    if (v === null) {
      close();
      return;
    }

    let x = bandCenter(i, values.length);
    if (run.length === 0) {
      first = x;
    }

    last = x;
    run.push(`${x.toFixed(1)},${y(v).toFixed(1)}`);
  });

  close();

  return d.trim();
}

export function lastValue(values: (number | null)[]): { i: number; v: number } | null {
  for (let i = values.length - 1; i >= 0; i--) {
    let v = values[i];
    if (v !== null) {
      return { i, v };
    }
  }

  return null;
}

export function percentLeft(x: number): string {
  return `${((x / W) * 100).toFixed(2)}%`;
}

export function percentTop(y: number): string {
  return `${((y / H) * 100).toFixed(2)}%`;
}
