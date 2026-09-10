export type Source = { start_time?: string; end_time?: string; text?: string };
export type UserStory = { id: string; role: string; action: string; goal: string };

export type Req = {
  id: string;
  public_id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  confidence: number;
  needs_clarification: boolean;
  manual: boolean;
  for_roles?: string;
  source?: Source;
  user_stories: UserStory[];
};

export type Segment = { id: string; start_sec: number; end_sec: number; speaker: string | null; text: string };
export type Question = { id: string; description: string; source_text?: string | null; resolved: boolean };
export type Contra = {
  id: string;
  requirement_public_ids: string;
  description: string;
  recommendation: string;
  resolved: boolean;
};

export type MeetingData = {
  meeting: {
    id: string;
    title: string;
    description?: string;
    status: string;
    summary?: string | null;
    duration_sec?: number | null;
    created_at?: string;
    error?: string | null;
  };
  requirements: Req[];
  constraints: Req[];
  open_questions: Question[];
  contradictions: Contra[];
  roles: string[];
  counts?: Record<string, number>;
  transcript: Segment[];
};

export const PRIO_RU: Record<string, string> = { high: "Высокий", medium: "Средний", low: "Низкий" };
export const PRIO_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "HH:MM:SS" | "MM:SS" -> секунды */
export function parseTc(t?: string): number | null {
  if (!t) return null;
  const p = t.split(":").map(Number);
  if (p.some(isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] ?? null;
}
