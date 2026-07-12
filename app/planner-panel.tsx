"use client";
/* eslint-disable react-hooks/exhaustive-deps -- authentication headers and action helpers are scoped to the current token. */
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  assignmentProgress,
  topThree,
  type PlannerState,
  type StudySession,
  type Subtask,
} from "@/lib/planner";

export function PlannerPanel({
  token,
  termId,
  classes,
}: {
  token: string;
  termId: string;
  classes: string[];
}) {
  const [state, setState] = useState<PlannerState | null>(null),
    [adding, setAdding] = useState(false),
    [view, setView] = useState<"today" | "calendar" | "assignments">("today"),
    [feedback, setFeedback] = useState<StudySession | null>(null),
    [message, setMessage] = useState("");
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
  useEffect(() => {
    if (!token) return;
    void fetch("/api/planner", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then(async (data) => {
        let next = data.state as PlannerState;
        if (termId && next.preferences.activeTermId !== termId) {
          const response = await fetch("/api/planner", {
              method: "POST",
              headers,
              body: JSON.stringify({ action: "generate", termId }),
            }),
            result = await response.json();
          next = result.state;
        }
        setState(next);
        if (next?.warnings?.length) setMessage(next.warnings.join(" "));
      });
  }, [token, termId]);
  useEffect(() => {
    const reload = () => {
      void fetch("/api/planner", {
        headers: { authorization: `Bearer ${token}` },
      })
        .then((response) => response.json())
        .then((data) => setState(data.state));
    };
    window.addEventListener("aster-planner-updated", reload);
    return () => window.removeEventListener("aster-planner-updated", reload);
  }, [token]);
  useEffect(() => {
    const button = [...document.querySelectorAll("button")].find((item) =>
        item.textContent?.includes("Regenerate plan"),
      ),
      regenerate = () => {
        void action({ action: "generate", termId }).then((next) =>
          setMessage(
            next.warnings.length
              ? next.warnings.join(" ")
              : "Your study plan was regenerated.",
          ),
        );
      };
    button?.addEventListener("click", regenerate);
    return () => button?.removeEventListener("click", regenerate);
  }, [token, termId]);
  const today = useMemo(() => (state ? topThree(state) : []), [state]);
  async function save(next: PlannerState) {
    const response = await fetch("/api/planner", {
        method: "PUT",
        headers,
        body: JSON.stringify(next),
      }),
      data = await response.json();
    setState(data.state);
  }
  async function action(body: Record<string, unknown>) {
    const response = await fetch("/api/planner", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      data = await response.json();
    setState(data.state);
    return data.state as PlannerState;
  }
  async function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state) return;
    const form = event.currentTarget,
      data = new FormData(form),
      type = String(data.get("type")) as "assignment" | "exam",
      title = String(data.get("title")),
      subject = String(data.get("subject")),
      minutes = Number(data.get("minutes")),
      names = String(data.get("subtasks") || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      subtasks: Subtask[] = names.map((name, index) => ({
        id: crypto.randomUUID(),
        title: name,
        estimatedMinutes: Math.max(15, Math.round(minutes / names.length)),
        completed: false,
        order: index,
      })),
      practiceQuestions =
        type === "exam" && data.get("practiceQuestions") === "on";
    let practiceQuestionText = "";
    if (practiceQuestions) {
      const response = await fetch("/api/ai/study", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "questions", title, subject }),
        }),
        ai = await response.json();
      if (response.ok) {
        practiceQuestionText = ai.text;
        subtasks.push({
          id: crypto.randomUUID(),
          title: `Practice questions: ${ai.text}`,
          estimatedMinutes: Math.max(25, state.preferences.sessionMinutes),
          completed: false,
          order: subtasks.length,
        });
      }
    }
    const response = await fetch("/api/assignments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          termId,
          subject,
          title,
          type,
          due: new Date(String(data.get("due"))).toISOString(),
          priority: String(data.get("priority")),
          estimatedMinutes: minutes,
          subtasks,
          practiceQuestions,
          practiceQuestionText,
        }),
      }),
      result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Task could not be scheduled.");
      return;
    }
    setState(result.state);
    setAdding(false);
    form.reset();
    setMessage(
      practiceQuestionText
        ? "Aster split the work, generated practice questions, and rebuilt your schedule."
        : "Aster split the work and rebuilt your schedule.",
    );
  }
  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedback) return;
    const data = new FormData(event.currentTarget);
    await action({
      action: "complete",
      sessionId: feedback.id,
      actualMinutes: Number(data.get("actualMinutes")),
      difficulty: String(data.get("difficulty")),
      location: String(data.get("location")),
      trigger: String(data.get("trigger")),
    });
    setFeedback(null);
    setMessage("Session completed. Future estimates will learn from this.");
  }
  async function toggleSubtask(assignmentId: number, subtaskId: string) {
    if (!state) return;
    const assignments = state.assignments.map((assignment) =>
      assignment.id !== assignmentId
        ? assignment
        : {
            ...assignment,
            subtasks: assignment.subtasks.map((item) =>
              item.id === subtaskId
                ? { ...item, completed: !item.completed }
                : item,
            ),
          },
    );
    await save({ ...state, assignments });
  }
  if (!state)
    return (
      <section className="advanced-planner">
        <p>Building your plan…</p>
      </section>
    );
  const sessions = [...state.sessions].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  return (
    <section className="advanced-planner">
      <div className="planner-toolbar">
        <div>
          <small>SMART PLANNER</small>
          <h2>
            {view === "today"
              ? "Today’s Top 3"
              : view === "calendar"
                ? "Study calendar"
                : "Assignments & exams"}
          </h2>
        </div>
        <nav>
          <button
            className={view === "today" ? "active" : ""}
            onClick={() => setView("today")}
          >
            Top 3
          </button>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
          <button
            className={view === "assignments" ? "active" : ""}
            onClick={() => setView("assignments")}
          >
            Assignments
          </button>
        </nav>
        <button className="bright-button" onClick={() => setAdding(true)}>
          ＋ Smart task
        </button>
      </div>
      {message && <p className="planner-message">{message}</p>}
      {state.revisions.some((item) => !item.undone) && (
        <div className="revision-banner">
          <span>
            {state.revisions.find((item) => !item.undone)?.explanation}
          </span>
          <button onClick={() => void action({ action: "undo" })}>Undo</button>
        </div>
      )}
      {view === "today" && (
        <div className="top-three">
          {today.length ? (
            today.map((session, index) => (
              <SessionCard
                key={session.id}
                session={session}
                index={index}
                onComplete={() => setFeedback(session)}
                onSkip={() =>
                  void action({ action: "skip", sessionId: session.id })
                }
              />
            ))
          ) : (
            <div className="planner-empty">
              No sessions need attention today. Add a smart task or regenerate
              your plan.
            </div>
          )}
        </div>
      )}
      {view === "calendar" && (
        <div className="session-calendar">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onComplete={() => setFeedback(session)}
              onSkip={() =>
                void action({ action: "skip", sessionId: session.id })
              }
            />
          ))}
        </div>
      )}
      {view === "assignments" && (
        <div className="planner-assignments">
          {state.assignments.map((assignment) => (
            <article key={assignment.id}>
              <span>{assignment.type === "exam" ? "EXAM" : "ASSIGNMENT"}</span>
              <h3>{assignment.title}</h3>
              <p>
                {assignment.subject} · due{" "}
                {new Date(assignment.due).toLocaleString()}
              </p>
              <b>{assignmentProgress(assignment)}% complete</b>
              <div>
                {assignment.subtasks.map((item) => (
                  <label key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() =>
                        void toggleSubtask(assignment.id, item.id)
                      }
                    />
                    <span>{item.title}</span>
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      {adding && (
        <div className="dark-overlay">
          <form className="dark-modal" onSubmit={addTask}>
            <div className="modal-title">
              <span className="modal-orb">✦</span>
              <button type="button" onClick={() => setAdding(false)}>
                ×
              </button>
            </div>
            <small>SMART WORKLOAD</small>
            <h2>Plan an assignment or exam.</h2>
            <div className="form-pair">
              <label>
                Type
                <select name="type">
                  <option value="assignment">Assignment</option>
                  <option value="exam">Exam</option>
                </select>
              </label>
              <label>
                Class
                <select name="subject">
                  {classes.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Title
              <input name="title" required />
            </label>
            <div className="form-pair">
              <label>
                Due
                <input name="due" type="datetime-local" required />
              </label>
              <label>
                Estimated minutes
                <input
                  name="minutes"
                  type="number"
                  min="15"
                  step="15"
                  defaultValue="120"
                  required
                />
              </label>
            </div>
            <label>
              Priority
              <select name="priority">
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </label>
            <label>
              Steps
              <input
                name="subtasks"
                defaultValue="Research, Outline, Draft, Review"
                required
              />
              <small>Edit the comma-separated steps before scheduling.</small>
            </label>
            <label className="check-row">
              <input name="practiceQuestions" type="checkbox" /> Add a
              practice-question review session
            </label>
            <button className="bright-button wide">
              Split work & schedule
            </button>
          </form>
        </div>
      )}
      {feedback && (
        <div className="dark-overlay">
          <form className="dark-modal" onSubmit={complete}>
            <h2>How did that session go?</h2>
            <label>
              Actual minutes
              <input
                name="actualMinutes"
                type="number"
                min="1"
                defaultValue={Math.round(
                  (new Date(feedback.end).getTime() -
                    new Date(feedback.start).getTime()) /
                    60000,
                )}
                required
              />
            </label>
            <label>
              Difficulty
              <select name="difficulty">
                <option value="easier">Easier than expected</option>
                <option value="expected">As expected</option>
                <option value="harder">Harder than expected</option>
              </select>
            </label>
            <label>
              Where did you study?
              <input name="location" placeholder="At my desk" />
            </label>
            <label>
              When/trigger
              <input name="trigger" placeholder="After dinner" />
            </label>
            <button className="bright-button wide">Complete session</button>
            <button
              className="setup-back"
              type="button"
              onClick={() => setFeedback(null)}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function SessionCard({
  session,
  index,
  onComplete,
  onSkip,
}: {
  session: StudySession;
  index?: number;
  onComplete: () => void;
  onSkip: () => void;
}) {
  async function move() {
    const suggested = new Date(session.start);
    suggested.setMinutes(
      suggested.getMinutes() - suggested.getTimezoneOffset(),
    );
    const value = window.prompt(
        "Move this session to (local date and time):",
        suggested.toISOString().slice(0, 16),
      ),
      saved = localStorage.getItem("aster-session");
    if (!value || !saved) return;
    const start = new Date(value),
      duration =
        new Date(session.end).getTime() - new Date(session.start).getTime(),
      token = (JSON.parse(saved) as { access_token: string }).access_token,
      response = await fetch("/api/planner", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "move",
          sessionId: session.id,
          start: start.toISOString(),
          end: new Date(start.getTime() + duration).toISOString(),
        }),
      });
    if (!response.ok) {
      const data = await response.json();
      window.alert(data.error || "That session could not be moved.");
      return;
    }
    window.location.reload();
  }
  return (
    <article className={`session-card status-${session.status}`}>
      <span>
        {index !== undefined
          ? `0${index + 1}`
          : new Date(session.start).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
      </span>
      <div>
        <small>{session.subject}</small>
        <h3>{session.title}</h3>
        <p>
          {new Date(session.start).toLocaleString(undefined, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
          })}
          –
          {new Date(session.end).toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
        {(session.trigger || session.location) && (
          <em>
            {session.trigger}
            {session.trigger && session.location ? ", " : ""}
            {session.location}
          </em>
        )}
      </div>
      {session.status === "planned" && (
        <aside>
          <button onClick={onComplete}>Complete</button>
          <button onClick={() => void move()}>Move</button>
          <button onClick={onSkip}>Skip</button>
        </aside>
      )}
    </article>
  );
}
