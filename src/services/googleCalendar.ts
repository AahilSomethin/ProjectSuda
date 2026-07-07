import { config } from "../config";
import type { CalendarMeeting } from "../types";

// Google Calendar integration disabled for now — mocks only until API is wired up.
const MOCK_MEETINGS: CalendarMeeting[] = [
  {
    id: "meeting-1",
    title: "Sprint Planning",
    startTime: new Date(Date.now() + 3600_000).toISOString(),
    endTime: new Date(Date.now() + 7200_000).toISOString(),
    description: "Review backlog and assign sprint tasks",
  },
  {
    id: "meeting-2",
    title: "Design Review",
    startTime: new Date(Date.now() + 14400_000).toISOString(),
    endTime: new Date(Date.now() + 18000_000).toISOString(),
    description: "Walk through new dashboard mockups",
  },
];

// async function fetchFromGoogleCalendar(): Promise<CalendarMeeting[]> {
//   // TODO: Enable when Google Calendar integration is ready
//   // const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.googleCalendarId)}/events?key=${config.googleCalendarApiKey}&timeMin=${new Date().toISOString()}&maxResults=10&singleEvents=true&orderBy=startTime`;
//   // const response = await fetch(url);
//   // const data = await response.json();
//   // return data.items.map(...);
//   throw new Error("Google Calendar API not yet implemented");
// }

export async function fetchUpcomingMeetings(): Promise<CalendarMeeting[]> {
  if (!config.googleCalendarEnabled) {
    return MOCK_MEETINGS;
  }

  // if (config.googleCalendarApiKey) {
  //   try {
  //     return await fetchFromGoogleCalendar();
  //   } catch {
  //     return MOCK_MEETINGS;
  //   }
  // }

  return MOCK_MEETINGS;
}

export { MOCK_MEETINGS };
