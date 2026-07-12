"use client";
import { FormEvent, useEffect, useState } from "react";
import type { AuthSession } from "../supabase";
import Link from "next/link";
import {
  IntegrationSettings,
  ScheduleSettings as ScheduleSettingsBase,
} from "./advanced-settings";
import { ExceptionSettings } from "./exception-settings";
import { ImportHistory } from "./import-history";
import { SyllabusImporter } from "./syllabus-importer";
const ScheduleSettings = ({ token }: { token: string }) => (
  <>
    <ScheduleSettingsBase token={token} />
    <ExceptionSettings token={token} />
  </>
);
const ImportSettings = ({ token }: { token: string }) => {
  const [termId, setTermId] = useState("");
  useEffect(() => {
    void fetch("/api/profile", {
      headers: { authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => setTermId(data.profile?.activeTermId || ""));
  }, [token]);
  return termId ? (
    <>
      <SyllabusImporter token={token} termId={termId} />
      <ImportHistory token={token} />
    </>
  ) : (
    <div className="settings-card">Loading active term…</div>
  );
};
type Term = {
  id: string;
  season: "Spring" | "Summer" | "Fall";
  year: number;
  classes: string[];
};
type Profile = {
  fullName: string;
  username: string;
  email: string;
  classes: string[];
  terms: Term[];
  activeTermId: string;
};
type Tab = "account" | "classes" | "schedule" | "integrations" | "imports";
export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("account"),
    [session, setSession] = useState<AuthSession | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [addingTerm, setAddingTerm] = useState(false);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(
        "tab",
      ) as Tab | null,
      saved = localStorage.getItem("aster-session");
    if (!saved) {
      window.location.replace("/");
      return;
    }
    const next = JSON.parse(saved) as AuthSession;
    void fetch("/api/profile", {
      headers: { authorization: `Bearer ${next.access_token}` },
    }).then(async (response) => {
      if (response.status === 401) {
        localStorage.removeItem("aster-session");
        window.location.replace("/");
        return;
      }
      const data = (await response.json()) as { profile: Profile | null };
      if (!data.profile) {
        window.location.replace("/");
        return;
      }
      setSession(next);
      setTab(
        ["account", "classes", "schedule", "integrations", "imports"].includes(
          wanted || "",
        )
          ? wanted!
          : "account",
      );
      setProfile(data.profile);
      setLoading(false);
    });
  }, []);
  async function persist(next: Profile, success: string) {
    if (!session) return false;
    const active = next.terms.find((term) => term.id === next.activeTermId),
      payload = { ...next, classes: active?.classes || [] },
      response = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
    if (!response.ok) {
      setMessage(
        (await response.json()).error || "Changes could not be saved.",
      );
      return false;
    }
    setProfile(payload);
    setMessage(success);
    return true;
  }
  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const data = new FormData(event.currentTarget);
    await persist(
      {
        ...profile,
        fullName: String(data.get("fullName")),
        username: String(data.get("username")),
      },
      "Account saved.",
    );
  }
  async function chooseTerm(id: string) {
    if (profile)
      await persist({ ...profile, activeTermId: id }, "Active term changed.");
  }
  async function addTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = event.currentTarget,
      data = new FormData(form),
      season = String(data.get("season")) as Term["season"],
      year = Number(data.get("year")),
      classes = String(data.get("classes"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      id = `${season.toLowerCase()}-${year}`;
    if (profile.terms.some((term) => term.id === id)) {
      setMessage("That term already exists.");
      return;
    }
    if (
      await persist(
        {
          ...profile,
          terms: [...profile.terms, { id, season, year, classes }],
          activeTermId: id,
        },
        `${season} ${year} added.`,
      )
    ) {
      setAddingTerm(false);
      form.reset();
    }
  }
  async function addClasses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const form = event.currentTarget,
      values = String(new FormData(form).get("newClasses"))
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      terms = profile.terms.map((term) =>
        term.id !== profile.activeTermId
          ? term
          : { ...term, classes: [...new Set([...term.classes, ...values])] },
      );
    if (await persist({ ...profile, terms }, "Classes added.")) form.reset();
  }
  async function removeClass(name: string) {
    if (!profile) return;
    const active = profile.terms.find(
      (term) => term.id === profile.activeTermId,
    );
    if (!active || active.classes.length === 1) {
      setMessage("Keep at least one class.");
      return;
    }
    await persist(
      {
        ...profile,
        terms: profile.terms.map((term) =>
          term.id === active.id
            ? {
                ...term,
                classes: term.classes.filter((value) => value !== name),
              }
            : term,
        ),
      },
      `${name} removed.`,
    );
  }
  if (loading || !session)
    return (
      <main className="settings-loading">
        <span>✦</span>
        <p>Opening settings…</p>
      </main>
    );
  const active = profile?.terms.find(
      (term) => term.id === profile.activeTermId,
    ),
    tabs: Array<[Tab, string, string, string]> = [
      ["account", "◎", "Account", "Profile and email"],
      ["classes", "▤", "Classes", "Terms and classes"],
      ["schedule", "◷", "Schedule", "Availability and limits"],
      ["integrations", "↗", "Integrations", "Calendar connections"],
      ["imports", "⇧", "Imports", "Syllabi and lists"],
    ];
  return (
    <main className="settings-shell">
      <aside className="settings-rail">
        <Link className="brand" href="/">
          <span className="brand-mark">A</span>
          <span>Aster</span>
        </Link>
        <Link className="settings-back" href="/">
          ← Back to planner
        </Link>
        <div>
          <small>SETTINGS</small>
          {tabs.map(([id, icon, title, subtitle]) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMessage("");
              }}
            >
              <span>{icon}</span>
              <div>
                <strong>{title}</strong>
                <small>{subtitle}</small>
              </div>
            </button>
          ))}
        </div>
        <button
          className="settings-signout"
          onClick={() => {
            localStorage.removeItem("aster-session");
            window.location.replace("/");
          }}
        >
          Sign out
        </button>
      </aside>
      <section className="settings-content">
        <header>
          <small>PERSONAL SETTINGS</small>
          <h1>{tabs.find((item) => item[0] === tab)?.[2]}</h1>
          <p>Keep Aster aligned with your real schedule and study habits.</p>
        </header>
        {tab === "account" && (
          <form className="settings-card" onSubmit={saveAccount}>
            <div className="settings-card-head">
              <div className="settings-avatar">
                {profile?.fullName
                  .split(" ")
                  .map((x) => x[0])
                  .slice(0, 2)
                  .join("")}
              </div>
              <div>
                <h2>Profile information</h2>
                <p>Visible only in your workspace.</p>
              </div>
            </div>
            <label>
              Full name
              <input
                name="fullName"
                defaultValue={profile?.fullName}
                required
              />
            </label>
            <label>
              Username
              <input
                name="username"
                defaultValue={profile?.username}
                pattern="[a-zA-Z0-9_-]{3,24}"
                required
              />
            </label>
            <label>
              Email
              <input value={profile?.email} readOnly />
            </label>
            {message && <p className="settings-message">{message}</p>}
            <button className="bright-button">Save account</button>
          </form>
        )}
        {tab === "classes" && (
          <div className="settings-card">
            <div className="settings-card-head">
              <span className="settings-class-icon">▤</span>
              <div>
                <h2>Manage terms</h2>
                <p>Each term keeps its own classes.</p>
              </div>
            </div>
            <div className="term-toggle">
              {profile?.terms.map((term) => (
                <button
                  type="button"
                  className={term.id === profile.activeTermId ? "active" : ""}
                  key={term.id}
                  onClick={() => void chooseTerm(term.id)}
                >
                  {term.season} &apos;{String(term.year).slice(-2)}
                </button>
              ))}
              <button
                type="button"
                className="add-term"
                onClick={() => setAddingTerm(!addingTerm)}
              >
                ＋ Add term
              </button>
            </div>
            {addingTerm && (
              <form className="term-form" onSubmit={addTerm}>
                <div className="form-pair">
                  <label>
                    Season
                    <select name="season">
                      <option>Spring</option>
                      <option>Summer</option>
                      <option>Fall</option>
                    </select>
                  </label>
                  <label>
                    Year
                    <input
                      name="year"
                      type="number"
                      defaultValue={new Date().getFullYear()}
                      required
                    />
                  </label>
                </div>
                <label>
                  Classes
                  <input name="classes" required />
                </label>
                <button className="bright-button">Create term</button>
              </form>
            )}
            <form className="term-form" onSubmit={addClasses}>
              <h3>
                {active?.season} {active?.year}
              </h3>
              <label>
                Add classes
                <input name="newClasses" required />
              </label>
              <div className="class-preview class-actions">
                {active?.classes.map((name) => (
                  <button
                    type="button"
                    key={name}
                    onClick={() => void removeClass(name)}
                  >
                    {name}
                    <span>×</span>
                  </button>
                ))}
              </div>
              <button className="bright-button">Add classes</button>
            </form>
            {message && <p className="settings-message">{message}</p>}
          </div>
        )}
        {tab === "schedule" && (
          <ScheduleSettings token={session.access_token} />
        )}{" "}
        {tab === "integrations" && (
          <IntegrationSettings token={session.access_token} />
        )}{" "}
        {tab === "imports" && <ImportSettings token={session.access_token} />}
      </section>
    </main>
  );
}
