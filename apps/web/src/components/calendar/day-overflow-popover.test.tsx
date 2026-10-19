import enUS from "@i18n/en-US.json";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarTask } from "./calendar-task-bar";
import DayOverflowPopover from "./day-overflow-popover";
import MonthGrid from "./month-grid";
import { buildMonthWeeks } from "./month-grid-model";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

// A dedicated instance: the app singleton must not be imported beside a
// react-i18next mock. Inline resources keep the copy available synchronously.
const translations = i18next.use(initReactI18next).init({
  lng: "en-US",
  resources: { "en-US": enUS },
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

beforeEach(async () => {
  await translations;
});

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();
  // Bind once: a fresh `t` on every render re-creates anything keyed on it.
  const t = i18next.t.bind(i18next);
  return { ...actual, useTranslation: () => ({ t, i18n: i18next }) };
});

vi.mock("@/lib/format", () => ({
  formatDate: () => "Monday, August 10",
  formatDateShort: (value: Date) => value.toISOString().slice(0, 10),
}));

// formatDate is mocked above, so the interpolated day label is fixed.
const TRIGGER_NAME = "Show all tasks for Monday, August 10";

function task(
  id: string,
  title: string,
  number: number | null,
  start: Date,
  end: Date,
): CalendarTask {
  return {
    id,
    title,
    number,
    status: "to-do",
    scheduleStart: start,
    scheduleEnd: end,
  };
}

const AUGUST_10 = new Date(2026, 7, 10);

const dayTasks = [
  task("t1", "Design review", 12, new Date(2026, 7, 10), new Date(2026, 7, 12)),
  task("t2", "Ship release", 13, new Date(2026, 7, 10), new Date(2026, 7, 10)),
  task("t3", "Write docs", null, new Date(2026, 7, 9), new Date(2026, 7, 11)),
];

describe("DayOverflowPopover", () => {
  it("keeps the task list closed until the overflow label is clicked", () => {
    render(
      <DayOverflowPopover
        day={AUGUST_10}
        tasks={dayTasks}
        hiddenCount={2}
        projectSlug="KAN"
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: TRIGGER_NAME })).toBeVisible();
    expect(screen.queryByText("Design review")).toBeNull();
  });

  it("lists every task for the day, not only the hidden ones", async () => {
    render(
      <DayOverflowPopover
        day={AUGUST_10}
        tasks={dayTasks}
        hiddenCount={2}
        projectSlug="KAN"
        onOpenTask={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));

    expect(await screen.findByText("Design review")).toBeVisible();
    expect(screen.getByText("Ship release")).toBeVisible();
    expect(screen.getByText("Write docs")).toBeVisible();
    expect(screen.getByText("KAN-12")).toBeVisible();
  });

  it("opens the task and closes the popover when an entry is clicked", async () => {
    const onOpenTask = vi.fn();

    render(
      <DayOverflowPopover
        day={AUGUST_10}
        tasks={dayTasks}
        hiddenCount={2}
        projectSlug="KAN"
        onOpenTask={onOpenTask}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));
    fireEvent.click(await screen.findByText("Ship release"));

    expect(onOpenTask).toHaveBeenCalledTimes(1);
    expect(onOpenTask).toHaveBeenCalledWith("t2");
    expect(screen.queryByText("Design review")).toBeNull();
  });

  it("omits the task key when the project slug is unknown", async () => {
    render(
      <DayOverflowPopover
        day={AUGUST_10}
        tasks={dayTasks}
        hiddenCount={2}
        onOpenTask={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: TRIGGER_NAME }));

    expect(await screen.findByText("Design review")).toBeVisible();
    expect(screen.queryByText("KAN-12")).toBeNull();
  });
});

describe("MonthGrid overflow wiring", () => {
  const weeks = buildMonthWeeks(AUGUST_10, 1);

  it("surfaces hidden tasks through the overflow popover", async () => {
    const onOpenTask = vi.fn();

    render(
      <MonthGrid
        weeks={weeks}
        tasks={dayTasks}
        visibleMonth={AUGUST_10}
        maxLanes={1}
        projectSlug="KAN"
        onOpenTask={onOpenTask}
      />,
    );

    // Only one lane fits, so the other two tasks on Aug 10 have to overflow.
    const trigger = screen.getAllByRole("button", { name: TRIGGER_NAME })[0];
    expect(trigger).toBeVisible();

    fireEvent.click(trigger);
    fireEvent.click(await screen.findByText("Ship release"));

    expect(onOpenTask).toHaveBeenCalledWith("t2");
  });

  it("renders no overflow trigger when every task fits", () => {
    render(
      <MonthGrid
        weeks={weeks}
        tasks={dayTasks}
        visibleMonth={AUGUST_10}
        maxLanes={5}
        projectSlug="KAN"
        onOpenTask={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: TRIGGER_NAME })).toBeNull();
  });
});
