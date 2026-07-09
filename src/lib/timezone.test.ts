import { describe, expect, it } from "vitest";
import {
  formatDueLabelInMaldivesTime,
  getGreetingForMaldivesTime,
  getMaldivesTodayString,
  isTodayInMaldives,
  isTomorrowInMaldives,
} from "./timezone";

describe("timezone", () => {
  it("calculates Maldives today from UTC evening", () => {
    const utcEvening = new Date("2026-07-08T22:00:00Z");
    expect(getMaldivesTodayString(utcEvening)).toBe("2026-07-09");
  });

  it("detects today and tomorrow for date-only due dates", () => {
    const now = new Date("2026-07-08T22:00:00Z");
    expect(isTodayInMaldives("2026-07-09", now)).toBe(true);
    expect(isTomorrowInMaldives("2026-07-10", now)).toBe(true);
  });

  it("formats due labels in Maldives time", () => {
    const now = new Date("2026-07-08T22:00:00Z");
    expect(formatDueLabelInMaldivesTime("2026-07-09", now)).toBe("due today");
    expect(formatDueLabelInMaldivesTime("2026-07-10", now)).toBe("due tomorrow");
    expect(formatDueLabelInMaldivesTime("2026-07-08", now)).toBe("overdue");
  });

  it("returns greeting buckets for Maldives hour", () => {
    const morning = new Date("2026-07-08T02:00:00Z");
    const afternoon = new Date("2026-07-08T08:00:00Z");
    const evening = new Date("2026-07-08T13:00:00Z");
    const night = new Date("2026-07-08T18:00:00Z");

    expect(getGreetingForMaldivesTime(morning)).toBe("morning");
    expect(getGreetingForMaldivesTime(afternoon)).toBe("afternoon");
    expect(getGreetingForMaldivesTime(evening)).toBe("evening");
    expect(getGreetingForMaldivesTime(night)).toBe("night");
  });
});
