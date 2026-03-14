function parseNumber(value: string, min: number, max: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Invalid cron value: ${value}`);
  }

  return parsed;
}

function expandSegment(segment: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const rawPart of segment.split(",")) {
    const part = rawPart.trim();
    if (!part) {
      continue;
    }

    let rangePart = part;
    let step = 1;

    if (part.includes("/")) {
      const [base, stepPart] = part.split("/");
      rangePart = base;
      step = parseNumber(stepPart, 1, max - min + 1);
    }

    if (rangePart === "*") {
      for (let value = min; value <= max; value += step) {
        values.add(value);
      }
      continue;
    }

    if (rangePart.includes("-")) {
      const [startPart, endPart] = rangePart.split("-");
      const start = parseNumber(startPart, min, max);
      const end = parseNumber(endPart, min, max);
      if (end < start) {
        throw new Error(`Invalid cron range: ${rangePart}`);
      }

      for (let value = start; value <= end; value += step) {
        values.add(value);
      }
      continue;
    }

    values.add(parseNumber(rangePart, min, max));
  }

  if (values.size === 0) {
    throw new Error(`Empty cron segment: ${segment}`);
  }

  return values;
}

type CronMatcher = {
  minutes: Set<number>;
  hours: Set<number>;
  daysOfMonth: Set<number>;
  months: Set<number>;
  daysOfWeek: Set<number>;
};

export function validateCronExpression(expression: string): void {
  parseCronExpression(expression);
}

function parseCronExpression(expression: string): CronMatcher {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Cron expression must contain 5 fields.");
  }

  return {
    minutes: expandSegment(parts[0], 0, 59),
    hours: expandSegment(parts[1], 0, 23),
    daysOfMonth: expandSegment(parts[2], 1, 31),
    months: expandSegment(parts[3], 1, 12),
    daysOfWeek: expandSegment(parts[4], 0, 6)
  };
}

function matches(date: Date, matcher: CronMatcher): boolean {
  return matcher.minutes.has(date.getMinutes())
    && matcher.hours.has(date.getHours())
    && matcher.daysOfMonth.has(date.getDate())
    && matcher.months.has(date.getMonth() + 1)
    && matcher.daysOfWeek.has(date.getDay());
}

export function nextCronRun(expression: string, fromDate: Date): string {
  const matcher = parseCronExpression(expression);
  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let attempt = 0; attempt < 525_600; attempt += 1) {
    if (matches(candidate, matcher)) {
      return candidate.toISOString();
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Unable to find next run for cron expression: ${expression}`);
}