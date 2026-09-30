import { DeployRow, DeployStatus, Health, StageStatus } from "#app/shared/services/models";

export function timeAgo(date: Date | null, now: Date): string {
  if (!date) {
    return "never";
  }

  let seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 10) {
    return "just now";
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  let minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  let hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  let days = Math.floor(hours / 24);

  return `${days}d ago`;
}

export function duration(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) {
    return "–";
  }

  let s = Math.max(0, Math.round(seconds));
  if (s < 60) {
    return `${s}s`;
  }

  let m = Math.floor(s / 60);
  if (m < 60) {
    return s % 60 === 0 ? `${m}m` : `${m}m ${s % 60}s`;
  }

  let h = Math.floor(m / 60);

  return m % 60 === 0 ? `${h}h` : `${h}h ${m % 60}m`;
}

/**
 * Wall time between two instants, or up to now while still running.
 */
export function elapsed(start: Date | null, end: Date | null, now: Date): number | null {
  if (!start) {
    return null;
  }

  return ((end ?? now).getTime() - start.getTime()) / 1000;
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : "";
}

export function clock(date: Date | null): string {
  if (!date) {
    return "";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export function dateTime(date: Date | null): string {
  if (!date) {
    return "";
  }

  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function healthClass(health: Health): string {
  switch (health) {
    case "healthy":
      return "is-success";

    case "degraded":
      return "is-warning";

    case "down":
      return "is-danger";

    default:
      return "";
  }
}

export function statusClass(status: DeployStatus | StageStatus): string {
  switch (status) {
    case "succeeded":
      return "is-success";

    case "failed":
      return "is-danger";

    case "running":
      return "is-info";

    case "queued":
    case "pending":
      return "is-warning";

    default:
      return "";
  }
}

export function statusLabel(d: DeployRow): string {
  if (d.status === "running" && d.currentStage) {
    return d.currentStage;
  }

  if (d.status === "failed" && d.failedStage) {
    return `failed at ${d.failedStage}`;
  }

  return d.status;
}

export function isActive(d: DeployRow): boolean {
  return d.status === "queued" || d.status === "running";
}
