export type ModuleKey = "gym" | "work" | "appointments" | "tasks" | "custom";
export type EventSource = "local" | "outlook" | "ics";
export type EventStatus = "planned" | "done" | "missed" | "moved" | "cancelled";

export interface ActivityType {
  id: string;
  user_id: string;
  module: ModuleKey;
  name: string;
  color: string;
  icon: string;
  has_timer: boolean;
  weekly_goal_minutes: number | null;
  weekly_goal_sessions: number | null;
}

export interface CalendarEvent {
  id: string;
  user_id: string;
  activity_type_id: string | null;
  title: string;
  notes: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  rrule: string | null;
  source: EventSource;
  external_id: string | null;
  etag: string | null;
  status: EventStatus;
  metadata: Record<string, unknown>;
}

export interface Pause {
  start: string;
  end: string | null;
}

export interface TimeSession {
  id: string;
  user_id: string;
  activity_type_id: string | null;
  event_id: string | null;
  source: "timer" | "holded";
  external_id: string | null;
  started_at: string;
  ended_at: string | null;
  pauses: Pause[];
  notes: string | null;
}

export interface Task {
  id: string;
  user_id: string;
  activity_type_id: string | null;
  title: string;
  due_at: string | null;
  done: boolean;
  source: EventSource;
  external_id: string | null;
  external_list_id: string | null;
}

export interface Suggestion {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  action: unknown;
  status: "open" | "accepted" | "dismissed";
  created_at: string;
}

export interface WorkoutSet {
  id: string;
  user_id: string;
  session_id: string;
  exercise: string;
  reps: number | null;
  weight_kg: number | null;
  created_at: string;
}
