export type Difficulty = "easier" | "expected" | "harder";
export type AvailabilityWindow = { day: number; start: string; end: string };
export type Commitment = {
  id: string;
  title: string;
  day: number;
  start: string;
  end: string;
};
export type ScheduleException = {
  id: string;
  title: string;
  start: string;
  end: string;
  source: "manual" | "google";
};
export type Subtask = {
  id: string;
  title: string;
  estimatedMinutes: number;
  completed: boolean;
  order: number;
};
export type PlannerAssignment = {
  id: number;
  termId: string;
  subject: string;
  title: string;
  type: "assignment" | "exam";
  due: string;
  priority: "High" | "Medium" | "Low";
  estimatedMinutes: number;
  subtasks: Subtask[];
  practiceQuestions: boolean;
  practiceQuestionText?: string;
  status: "active" | "completed";
};
export type StudySession = {
  id: string;
  assignmentId: number;
  subtaskId: string | null;
  title: string;
  subject: string;
  start: string;
  end: string;
  status: "planned" | "completed" | "skipped" | "missed";
  location: string;
  trigger: string;
  actualMinutes: number | null;
  difficulty: Difficulty | null;
  updatedAt: string;
};
export type PlannerRevision = {
  id: string;
  createdAt: string;
  reason: string;
  explanation: string;
  before: StudySession[];
  undone: boolean;
};
export type PlannerPreferences = {
  timezone: string;
  sessionMinutes: number;
  maxDailyMinutes: number;
  availability: AvailabilityWindow[];
  commitments: Commitment[];
  exceptions: ScheduleException[];
  activeTermId?: string;
};
export type PlannerState = {
  preferences: PlannerPreferences;
  assignments: PlannerAssignment[];
  sessions: StudySession[];
  revisions: PlannerRevision[];
  warnings: string[];
};

export const defaultPlannerState = (
  timezone = "America/Chicago",
): PlannerState => ({
  preferences: {
    timezone,
    sessionMinutes: 45,
    maxDailyMinutes: 180,
    availability: [1, 2, 3, 4, 5].map((day) => ({
      day,
      start: "16:00",
      end: "20:00",
    })),
    commitments: [],
    exceptions: [],
  },
  assignments: [],
  sessions: [],
  revisions: [],
  warnings: [],
});
export function normalizePlannerState(
  value: Partial<PlannerState> | null | undefined,
): PlannerState {
  const defaults = defaultPlannerState(value?.preferences?.timezone);
  return {
    ...defaults,
    ...value,
    preferences: {
      ...defaults.preferences,
      ...value?.preferences,
      availability:
        value?.preferences?.availability || defaults.preferences.availability,
      commitments: value?.preferences?.commitments || [],
      exceptions: value?.preferences?.exceptions || [],
    },
    assignments: value?.assignments || [],
    sessions: value?.sessions || [],
    revisions: value?.revisions || [],
    warnings: value?.warnings || [],
  };
}

const minutes = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
};
const iso = (date: Date) => date.toISOString();
const overlaps = (start: Date, end: Date, otherStart: Date, otherEnd: Date) =>
  start < otherEnd && end > otherStart;
const priorityWeight = { High: 3, Medium: 2, Low: 1 };
function zoneParts(date: Date, timeZone: string) {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let value = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = zoneParts(new Date(value), timeZone),
      represented = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      );
    value += target - represented;
  }
  return new Date(value);
}

export function assignmentProgress(assignment: PlannerAssignment) {
  if (!assignment.subtasks.length)
    return assignment.status === "completed" ? 100 : 0;
  return Math.round(
    (assignment.subtasks.filter((item) => item.completed).length /
      assignment.subtasks.length) *
      100,
  );
}

export function topThree(state: PlannerState, now = new Date()) {
  return state.sessions
    .filter(
      (session) =>
        session.status === "planned" &&
        new Date(session.start).toDateString() === now.toDateString(),
    )
    .sort((a, b) => {
      const aa = state.assignments.find((item) => item.id === a.assignmentId),
        bb = state.assignments.find((item) => item.id === b.assignmentId);
      return (
        priorityWeight[bb?.priority || "Low"] -
          priorityWeight[aa?.priority || "Low"] ||
        new Date(aa?.due || 0).getTime() - new Date(bb?.due || 0).getTime()
      );
    })
    .slice(0, 3);
}
export function validateSessionMove(
  state: PlannerState,
  sessionId: string,
  startValue: string,
  endValue: string,
) {
  const start = new Date(startValue),
    end = new Date(endValue),
    session = state.sessions.find((item) => item.id === sessionId);
  if (
    !session ||
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  )
    return "Choose a valid start and end time.";
  const assignment = state.assignments.find(
    (item) => item.id === session.assignmentId,
  );
  if (assignment && end > new Date(assignment.due))
    return "The session cannot end after its deadline.";
  const timeZone = state.preferences.timezone || "UTC",
    parts = zoneParts(start, timeZone),
    weekday = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay(),
    startMinute = parts.hour * 60 + parts.minute,
    endParts = zoneParts(end, timeZone),
    endMinute = endParts.hour * 60 + endParts.minute,
    inside = state.preferences.availability.some(
      (window) =>
        window.day === weekday &&
        startMinute >= minutes(window.start) &&
        endMinute <= minutes(window.end),
    );
  if (!inside) return "Move the session inside an available study window.";
  if (
    state.preferences.commitments.some(
      (item) =>
        item.day === weekday &&
        startMinute < minutes(item.end) &&
        endMinute > minutes(item.start),
    )
  )
    return "That time overlaps a recurring commitment.";
  if (
    (state.preferences.exceptions || []).some((item) =>
      overlaps(start, end, new Date(item.start), new Date(item.end)),
    )
  )
    return "That time is blocked by a schedule exception.";
  if (
    state.sessions.some(
      (item) =>
        item.id !== sessionId &&
        item.status === "planned" &&
        overlaps(start, end, new Date(item.start), new Date(item.end)),
    )
  )
    return "That time overlaps another study session.";
  const used =
    state.sessions
      .filter((item) => item.id !== sessionId && item.status === "planned")
      .filter((item) => {
        const value = zoneParts(new Date(item.start), timeZone);
        return (
          value.year === parts.year &&
          value.month === parts.month &&
          value.day === parts.day
        );
      })
      .reduce(
        (sum, item) =>
          sum +
          (new Date(item.end).getTime() - new Date(item.start).getTime()) /
            60000,
        0,
      ) +
    (end.getTime() - start.getTime()) / 60000;
  if (used > state.preferences.maxDailyMinutes)
    return "That move exceeds your daily study limit.";
  return null;
}

export function generateSchedule(
  state: PlannerState,
  now = new Date(),
  reason = "Plan generated",
) {
  const before = state.sessions.map((item) => ({ ...item })),
    completed = state.sessions.filter((item) => item.status === "completed"),
    pending: StudySession[] = [],
    warnings: string[] = [];
  const ratio = estimateRatio(completed);
  const assignments = [...state.assignments]
    .filter(
      (item) =>
        item.status === "active" &&
        new Date(item.due) > now &&
        (!state.preferences.activeTermId ||
          item.termId === state.preferences.activeTermId),
    )
    .sort(
      (a, b) =>
        priorityWeight[b.priority] - priorityWeight[a.priority] ||
        new Date(a.due).getTime() - new Date(b.due).getTime(),
    );
  const occupied = [...completed];
  for (const assignment of assignments) {
    const work = assignment.subtasks.length
      ? assignment.subtasks.filter((item) => !item.completed)
      : [
          {
            id: null,
            title: assignment.title,
            estimatedMinutes: assignment.estimatedMinutes,
            completed: false,
            order: 0,
          },
        ];
    for (const item of work) {
      let remaining = Math.max(
          15,
          Math.round(item.estimatedMinutes * (ratio[assignment.subject] || 1)),
        ),
        earliest = now;
      if (assignment.type === "exam") {
        const available = Math.max(
            86400000,
            new Date(assignment.due).getTime() - now.getTime(),
          ),
          spacing = Math.max(
            86400000,
            Math.floor(available / Math.max(2, work.length)),
          );
        earliest = new Date(
          Math.min(
            new Date(assignment.due).getTime() - 86400000,
            now.getTime() + item.order * spacing,
          ),
        );
        if (assignment.practiceQuestions)
          remaining += state.preferences.sessionMinutes;
      }
      while (remaining > 0) {
        const duration = Math.min(state.preferences.sessionMinutes, remaining),
          slot = findSlot(state, assignment.due, duration, occupied, earliest);
        if (!slot) break;
        const session: StudySession = {
          id: crypto.randomUUID(),
          assignmentId: assignment.id,
          subtaskId: item.id,
          title: item.title,
          subject: assignment.subject,
          start: iso(slot.start),
          end: iso(slot.end),
          status: "planned",
          location: "",
          trigger: "",
          actualMinutes: null,
          difficulty: null,
          updatedAt: iso(now),
        };
        pending.push(session);
        occupied.push(session);
        remaining -= duration;
      }
      if (remaining > 0)
        warnings.push(
          `${assignment.title}: ${remaining} minutes could not fit before the deadline. Add availability or reduce the workload.`,
        );
    }
  }
  const sessions = [...completed, ...pending].sort((a, b) =>
      a.start.localeCompare(b.start),
    ),
    revision: PlannerRevision = {
      id: crypto.randomUUID(),
      createdAt: iso(now),
      reason,
      explanation: warnings.length
        ? `Aster rebuilt ${pending.length} sessions, but some work could not fit. Review the scheduling warning and add availability.`
        : `Aster rebuilt ${pending.length} study sessions around your availability, commitments, deadlines, and daily limit.`,
      before,
      undone: false,
    };
  return {
    ...state,
    sessions,
    warnings,
    revisions: [revision, ...state.revisions].slice(0, 20),
  };
}

export function markMissedAndReschedule(state: PlannerState, now = new Date()) {
  const missed = state.sessions.some(
    (session) => session.status === "planned" && new Date(session.end) < now,
  );
  if (!missed) return state;
  const sessions = state.sessions.map((session) =>
    session.status === "planned" && new Date(session.end) < now
      ? { ...session, status: "missed" as const, updatedAt: iso(now) }
      : session,
  );
  return generateSchedule(
    { ...state, sessions },
    now,
    "Missed work was redistributed",
  );
}

function estimateRatio(sessions: StudySession[]) {
  const grouped: Record<string, number[]> = {};
  for (const session of sessions) {
    if (!session.actualMinutes) continue;
    const planned =
        (new Date(session.end).getTime() - new Date(session.start).getTime()) /
        60000,
      difficulty =
        session.difficulty === "harder"
          ? 1.1
          : session.difficulty === "easier"
            ? 0.9
            : 1;
    (grouped[session.subject] ??= []).push(
      (session.actualMinutes / planned) * difficulty,
    );
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([subject, values]) => [
      subject,
      Math.min(
        1.75,
        Math.max(
          0.6,
          values.slice(-8).reduce((a, b) => a + b, 0) / values.slice(-8).length,
        ),
      ),
    ]),
  );
}

function findSlot(
  state: PlannerState,
  due: string,
  duration: number,
  occupied: StudySession[],
  now: Date,
) {
  const deadline = new Date(due),
    timeZone = state.preferences.timezone || "UTC",
    today = zoneParts(now, timeZone);
  for (let offset = 0; offset < 45; offset++) {
    const calendarDay = new Date(
        Date.UTC(today.year, today.month - 1, today.day + offset),
      ),
      year = calendarDay.getUTCFullYear(),
      month = calendarDay.getUTCMonth() + 1,
      day = calendarDay.getUTCDate(),
      weekday = calendarDay.getUTCDay(),
      windows = state.preferences.availability.filter(
        (window) => window.day === weekday,
      );
    for (const window of windows) {
      const startMinute = minutes(window.start),
        endMinute = minutes(window.end);
      for (
        let value = startMinute;
        value + duration <= endMinute;
        value += 15
      ) {
        const start = zonedDate(
            year,
            month,
            day,
            Math.floor(value / 60),
            value % 60,
            timeZone,
          ),
          end = new Date(start.getTime() + duration * 60000);
        if (start < now || end > deadline) continue;
        const committed = state.preferences.commitments.some(
          (item) =>
            item.day === weekday &&
            value < minutes(item.end) &&
            value + duration > minutes(item.start),
        );
        if (committed) continue;
        const excepted = (state.preferences.exceptions || []).some((item) =>
          overlaps(start, end, new Date(item.start), new Date(item.end)),
        );
        if (excepted) continue;
        const used = occupied
          .filter((item) => {
            const parts = zoneParts(new Date(item.start), timeZone);
            return (
              parts.year === year && parts.month === month && parts.day === day
            );
          })
          .reduce(
            (sum, item) =>
              sum +
              (new Date(item.end).getTime() - new Date(item.start).getTime()) /
                60000,
            0,
          );
        if (used + duration > state.preferences.maxDailyMinutes) continue;
        if (
          occupied.some((item) =>
            overlaps(start, end, new Date(item.start), new Date(item.end)),
          )
        )
          continue;
        return { start, end };
      }
    }
  }
  return null;
}
