import test from "node:test";
import assert from "node:assert/strict";
// Node's type-stripping test runner requires the explicit extension.
// @ts-expect-error TS5097 is intentional for direct Node execution.
import {
  defaultPlannerState,
  generateSchedule,
  markMissedAndReschedule,
  topThree,
  validateSessionMove,
  type PlannerAssignment,
} from "../lib/planner.ts";

function assignment(
  overrides: Partial<PlannerAssignment> = {},
): PlannerAssignment {
  return {
    id: 1,
    termId: "fall-2027",
    subject: "Biology",
    title: "Lab report",
    type: "assignment",
    due: "2027-09-10T22:00:00.000Z",
    priority: "High",
    estimatedMinutes: 120,
    subtasks: [
      {
        id: "draft",
        title: "Draft",
        estimatedMinutes: 120,
        completed: false,
        order: 0,
      },
    ],
    practiceQuestions: false,
    status: "active",
    ...overrides,
  };
}

test("schedules only inside availability and daily limit", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.activeTermId = "fall-2027";
  state.preferences.sessionMinutes = 45;
  state.preferences.maxDailyMinutes = 90;
  state.preferences.availability = [{ day: 1, start: "16:00", end: "18:00" }];
  state.assignments = [assignment()];
  const result = generateSchedule(state, new Date("2027-09-06T12:00:00.000Z"));
  assert.equal(result.sessions.length, 2);
  assert.equal(result.warnings.length, 1);
  const firstDay = result.sessions.filter(
    (item) => item.start.slice(0, 10) === result.sessions[0].start.slice(0, 10),
  );
  assert.ok(firstDay.length <= 2);
  for (const session of result.sessions) {
    const hour = new Date(session.start).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    });
    assert.ok(Number(hour) >= 16 && Number(hour) < 18);
  }
});

test("respects recurring commitments and one-off exceptions", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.activeTermId = "fall-2027";
  state.preferences.availability = [{ day: 1, start: "16:00", end: "20:00" }];
  state.preferences.commitments = [
    { id: "sport", title: "Practice", day: 1, start: "16:00", end: "17:00" },
  ];
  state.preferences.exceptions = [
    {
      id: "appointment",
      title: "Appointment",
      start: "2027-09-06T22:00:00.000Z",
      end: "2027-09-06T23:00:00.000Z",
      source: "manual",
    },
  ];
  state.assignments = [
    assignment({
      estimatedMinutes: 45,
      subtasks: [
        {
          id: "draft",
          title: "Draft",
          estimatedMinutes: 45,
          completed: false,
          order: 0,
        },
      ],
    }),
  ];
  const result = generateSchedule(state, new Date("2027-09-06T12:00:00.000Z"));
  assert.equal(result.sessions.length, 1);
  assert.equal(
    new Date(result.sessions[0].start).toISOString(),
    "2027-09-06T23:00:00.000Z",
  );
});

test("keeps terms isolated", () => {
  const state = defaultPlannerState();
  state.preferences.activeTermId = "fall-2027";
  state.assignments = [
    assignment(),
    assignment({ id: 2, termId: "spring-2028", title: "Other term" }),
  ];
  const result = generateSchedule(state, new Date("2027-09-06T12:00:00.000Z"));
  assert.ok(result.sessions.every((item) => item.assignmentId === 1));
});

test("missed sessions produce an undoable revision", () => {
  const state = defaultPlannerState();
  state.sessions = [
    {
      id: "late",
      assignmentId: 1,
      subtaskId: null,
      title: "Late work",
      subject: "Math",
      start: "2020-01-01T10:00:00.000Z",
      end: "2020-01-01T11:00:00.000Z",
      status: "planned",
      location: "",
      trigger: "",
      actualMinutes: null,
      difficulty: null,
      updatedAt: "2020-01-01T10:00:00.000Z",
    },
  ];
  const result = markMissedAndReschedule(
    state,
    new Date("2020-01-02T00:00:00.000Z"),
  );
  assert.equal(result.revisions[0].reason, "Missed work was redistributed");
  assert.equal(result.revisions[0].undone, false);
  assert.equal(result.revisions[0].before[0].id, "late");
});

test("manual moves cannot violate constraints", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.availability = [{ day: 1, start: "16:00", end: "20:00" }];
  state.preferences.commitments = [
    { id: "club", title: "Club", day: 1, start: "17:00", end: "18:00" },
  ];
  state.assignments = [assignment()];
  state.sessions = [
    {
      id: "session",
      assignmentId: 1,
      subtaskId: "draft",
      title: "Draft",
      subject: "Biology",
      start: "2027-09-06T21:00:00.000Z",
      end: "2027-09-06T21:45:00.000Z",
      status: "planned",
      location: "",
      trigger: "",
      actualMinutes: null,
      difficulty: null,
      updatedAt: "2027-09-06T20:00:00.000Z",
    },
  ];
  assert.match(
    validateSessionMove(
      state,
      "session",
      "2027-09-06T22:00:00.000Z",
      "2027-09-06T22:45:00.000Z",
    ) || "",
    /commitment/,
  );
  assert.equal(
    validateSessionMove(
      state,
      "session",
      "2027-09-06T23:00:00.000Z",
      "2027-09-06T23:45:00.000Z",
    ),
    null,
  );
});

test("exam reviews are spaced across preparation days", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.activeTermId = "fall-2027";
  state.preferences.availability = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    start: "16:00",
    end: "20:00",
  }));
  state.assignments = [
    assignment({
      type: "exam",
      due: "2027-09-20T22:00:00.000Z",
      subtasks: [
        {
          id: "review",
          title: "Review",
          estimatedMinutes: 45,
          completed: false,
          order: 0,
        },
        {
          id: "practice",
          title: "Practice",
          estimatedMinutes: 45,
          completed: false,
          order: 1,
        },
        {
          id: "final",
          title: "Final review",
          estimatedMinutes: 45,
          completed: false,
          order: 2,
        },
      ],
    }),
  ];
  const result = generateSchedule(state, new Date("2027-09-06T12:00:00.000Z")),
    days = new Set(result.sessions.map((item) => item.start.slice(0, 10)));
  assert.ok(days.size >= 3);
});

test("Top 3 prioritizes high-priority urgent work", () => {
  const state = defaultPlannerState(),
    now = new Date("2027-09-06T12:00:00.000Z");
  state.assignments = [
    assignment({ id: 1, priority: "Low" }),
    assignment({ id: 2, priority: "High", title: "Urgent" }),
  ];
  state.sessions = [1, 2].map((id) => ({
    id: `s${id}`,
    assignmentId: id,
    subtaskId: null,
    title: `Task ${id}`,
    subject: "Biology",
    start: "2027-09-06T15:00:00.000Z",
    end: "2027-09-06T15:45:00.000Z",
    status: "planned" as const,
    location: "",
    trigger: "",
    actualMinutes: null,
    difficulty: null,
    updatedAt: now.toISOString(),
  }));
  assert.equal(topThree(state, now)[0].assignmentId, 2);
});

test("actual time and difficulty adjust future estimates", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.activeTermId = "fall-2027";
  state.preferences.availability = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    start: "16:00",
    end: "20:00",
  }));
  state.sessions = [
    {
      id: "history",
      assignmentId: 99,
      subtaskId: null,
      title: "Past",
      subject: "Biology",
      start: "2027-09-05T21:00:00.000Z",
      end: "2027-09-05T21:45:00.000Z",
      status: "completed",
      location: "",
      trigger: "",
      actualMinutes: 90,
      difficulty: "harder",
      updatedAt: "2027-09-05T22:00:00.000Z",
    },
  ];
  state.assignments = [
    assignment({
      estimatedMinutes: 45,
      subtasks: [
        {
          id: "draft",
          title: "Draft",
          estimatedMinutes: 45,
          completed: false,
          order: 0,
        },
      ],
    }),
  ];
  const result = generateSchedule(state, new Date("2027-09-06T12:00:00.000Z"));
  assert.equal(
    result.sessions.filter((item) => item.status === "planned").length,
    2,
  );
});

test("timezone conversion preserves local study hour across DST", () => {
  const state = defaultPlannerState("America/Chicago");
  state.preferences.activeTermId = "fall-2027";
  state.preferences.availability = [{ day: 0, start: "16:00", end: "18:00" }];
  state.assignments = [
    assignment({
      due: "2027-03-21T23:00:00.000Z",
      estimatedMinutes: 45,
      subtasks: [
        {
          id: "draft",
          title: "Draft",
          estimatedMinutes: 45,
          completed: false,
          order: 0,
        },
      ],
    }),
  ];
  const result = generateSchedule(state, new Date("2027-03-14T12:00:00.000Z")),
    hour = new Date(result.sessions[0].start).toLocaleString("en-US", {
      timeZone: "America/Chicago",
      hour: "numeric",
      hour12: false,
    });
  assert.equal(hour, "16");
});
