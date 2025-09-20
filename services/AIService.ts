// services/AIService.ts
import OpenAI from 'openai';

/**
 * ARMi AI Service
 * - Injects CURRENT_DATETIME freshly on EVERY call to avoid 'drift'
 * - Forces all relative time parsing to be based on CURRENT_DATETIME
 * - Enforces 'future only' timestamps via a tiny post-processor
 * - Echoes usedCurrentDatetime for logging/debug
 */

let openai: OpenAI | null = null;

try {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (apiKey && apiKey.startsWith('sk-')) {
    openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }
} catch (error) {
  console.log('OpenAI not available, using mock responses');
}

// -------- Time helpers (no external deps) --------
function getUserTimezone(userTz?: string): string {
  if (userTz) return userTz;
  try {
    // Works in RN/Expo on modern JS engines
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';
  } catch {
    return 'America/New_York';
  }
}

/**
 * Returns ISO string in UTC for the authoritative "now".
 * We give the model BOTH CURRENT_DATETIME_UTC and USER_TIMEZONE.
 * The prompt instructs it to resolve relative dates in USER_TIMEZONE
 * and to always output ISO WITH timezone offset.
 */
function nowIsoUtc(): string {
  return new Date().toISOString(); // e.g. 2025-09-20T11:36:18.000Z
}

/** Bump any non-future timestamp forward sensibly (minimal policy: +1 day). */
function ensureFutureISO(iso: string, nowUtcISO: string): string {
  try {
    const dt = new Date(iso);
    const now = new Date(nowUtcISO);
    if (isNaN(dt.getTime())) return iso;
    if (dt <= now) {
      const bumped = new Date(dt.getTime() + 24 * 60 * 60 * 1000);
      return bumped.toISOString();
    }
    return iso;
  } catch {
    return iso;
  }
}

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

// -------- Types --------
type ParsedMain = {
  intent: 'create_profile' | 'update_profile' | 'create_reminder' | 'schedule_text' | 'multi_action' | 'clarify';
  confidence: number;
  actions: Array<{
    type: 'create_profile' | 'update_profile' | 'create_reminder' | 'schedule_text';
    data: Record<string, any>;
  }>;
  response: string;
  clarification: string | null;
  // Added for logging/QA:
  usedCurrentDatetime?: string;
  note?: string;
};

type ParsedReminder = {
  action: 'create' | 'cancel' | 'clarify';
  title: string | null;
  description: string | null;
  type: 'general' | 'health' | 'celebration' | 'career' | 'life_event' | string;
  scheduledFor: string | null;
  response: string;
  // Added:
  usedCurrentDatetime?: string;
  note?: string;
};

class AIServiceClass {
  /**
   * Main NL → structured actions
   * Fresh CURRENT_DATETIME is injected every time. No caching.
   */
  async processInteraction(inputText: string, userTz?: string, devSimulatedNowISO?: string): Promise<ParsedMain> {
    try {
      if (!openai) {
        console.log('OpenAI not configured, using mock processing');
        const mock = this.mockAdvancedResponse(inputText);
        (mock as any).usedCurrentDatetime = nowIsoUtc();
        return mock as ParsedMain;
      }

      const USER_TIMEZONE = getUserTimezone(userTz);
      const CURRENT_DATETIME_UTC = devSimulatedNowISO || nowIsoUtc();
      const TODAY_UTC_DATE = CURRENT_DATETIME_UTC.slice(0, 10); // yyyy-mm-dd

      const system = `
You are ARMi (Artificial Relationship Management Intelligence), an assistant that returns ONLY JSON. You must parse intents and schedule times correctly.

# CLOCK & TIME RULES (AUTHORITATIVE)
- CURRENT_DATETIME_UTC: ${CURRENT_DATETIME_UTC}
- USER_TIMEZONE: ${USER_TIMEZONE}
- TODAY_UTC: ${TODAY_UTC_DATE}

1) Treat CURRENT_DATETIME_UTC as the ONLY ground-truth "now".
2) Resolve ALL relative terms (today, tomorrow, next Friday, in 3 days, etc.) relative to CURRENT_DATETIME_UTC, but interpret in USER_TIMEZONE for local wall-time.
3) ALWAYS output scheduled times as ISO 8601 **with an explicit timezone offset** (e.g., "2025-09-21T09:00:00-04:00"). If you cannot compute an offset, return a full ISO with 'Z' (UTC).
4) Output MUST be strictly in the FUTURE relative to CURRENT_DATETIME_UTC. If the parsed time is in the past, roll it forward to the next valid future occurrence and include a short "note" mentioning the roll-forward.
5) If user says a conflicting "today", IGNORE it unless they explicitly say "pretend today is ..."; even then, final scheduledFor MUST still be future vs CURRENT_DATETIME_UTC.
6) Deterministic defaults: "morning"→09:00, "afternoon"→15:00, "evening"→19:00, "tonight"→20:00, "noon"→12:00, "midnight"→00:00 (USER_TIMEZONE).

# RESPONSE FORMAT (MANDATORY - JSON only)
{
  "intent": "create_profile" | "update_profile" | "create_reminder" | "schedule_text" | "multi_action" | "clarify",
  "confidence": number (0.0-1.0),
  "actions": [
    {
      "type": "create_profile" | "update_profile" | "create_reminder" | "schedule_text",
      "data": {
        "name": "string | null",
        "age": number | null,
        "phone": "string | null",
        "email": "string | null",
        "relationship": "family|friend|partner|coworker|neighbor|acquaintance|unknown",
        "job": "string | null",
        "notes": "string | null",
        "tags": ["array"],
        "kids": ["array"],
        "siblings": ["array"],
        "parents": ["array"],
        "likes": ["array"],
        "dislikes": ["array"],
        "interests": ["array"],
        "instagram": "string | null",
        "snapchat": "string | null",
        "twitter": "string | null",
        "tiktok": "string | null",
        "facebook": "string | null",
        "birthday": "string | null (MM/DD/YYYY)",
        "lastContactDate": "ISO string | null",

        // Reminders
        "title": "string | null",
        "description": "string | null",
        "reminderType": "general|health|celebration|career|life_event|unknown",
        "scheduledFor": "ISO string with timezone (REQUIRED for reminders) | null",
        "profileId": number | null,

        // Scheduled texts
        "phoneNumber": "string | null",
        "message": "string | null",
        "profileId": number | null
      }
    }
  ],
  "response": "string",
  "clarification": "string | null",
  "usedCurrentDatetime": "echo back CURRENT_DATETIME_UTC you used",
  "note": "if you rolled-forward or assumed defaults, mention briefly"
}
`.trim();

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 2000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: inputText },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) throw new Error('No response from OpenAI');

      // Parse JSON safely
      const parsed = safeJson<ParsedMain>(raw, {
        intent: 'clarify',
        confidence: 0,
        actions: [],
        response: "I'm not sure yet.",
        clarification: 'Please rephrase.',
        usedCurrentDatetime: CURRENT_DATETIME_UTC,
      });

      // Post-process: enforce "future only" for any scheduledFor
      let noteAdded = false;
      if (parsed.actions?.length) {
        parsed.actions = parsed.actions.map(a => {
          const d = a.data || {};
          if (typeof d.scheduledFor === 'string' && d.scheduledFor.trim()) {
            const before = d.scheduledFor;
            const after = ensureFutureISO(before, CURRENT_DATETIME_UTC);
            if (after !== before) {
              noteAdded = true;
              d.scheduledFor = after;
            }
          }
          return { ...a, data: d };
        });
      }

      parsed.usedCurrentDatetime = CURRENT_DATETIME_UTC;
      if (noteAdded) {
        parsed.note = (parsed.note ? parsed.note + ' ' : '') + 'Rolled past time forward to keep it in the future.';
      }

      console.log('🤖 AI Response:', parsed);
      return parsed;
    } catch (error: any) {
      console.error('Error processing with OpenAI:', error);
      const mock = this.mockAdvancedResponse(inputText);
      (mock as any).usedCurrentDatetime = nowIsoUtc();
      return mock as ParsedMain;
    }
  }

  /**
   * Follow-up flow for reminder suggestions/confirmations
   * (Same CURRENT_DATETIME rules; also enforces future-only)
   */
  async processReminderResponse(inputText: string, context: any, userTz?: string, devSimulatedNowISO?: string): Promise<ParsedReminder> {
    try {
      if (!openai) {
        const mock = this.mockReminderResponse(inputText, context);
        (mock as any).usedCurrentDatetime = nowIsoUtc();
        return mock as ParsedReminder;
      }

      const USER_TIMEZONE = getUserTimezone(userTz);
      const CURRENT_DATETIME_UTC = devSimulatedNowISO || nowIsoUtc();
      const TODAY_UTC_DATE = CURRENT_DATETIME_UTC.slice(0, 10);

      const system = `
You are ARMi, handling reminder confirmations. Return ONLY JSON.

# CLOCK & TIME RULES
- CURRENT_DATETIME_UTC: ${CURRENT_DATETIME_UTC}
- USER_TIMEZONE: ${USER_TIMEZONE}
- TODAY_UTC: ${TODAY_UTC_DATE}

1) Resolve all relative times from CURRENT_DATETIME_UTC, in USER_TIMEZONE.
2) Always output ISO 8601 with explicit timezone when possible; otherwise UTC 'Z'.
3) Output must be strictly future vs CURRENT_DATETIME_UTC; roll-forward if needed and add a short "note".
4) Deterministic defaults: morning=09:00, afternoon=15:00, evening=19:00, tonight=20:00 (USER_TIMEZONE).

# OUTPUT (JSON only)
{
  "action": "create" | "cancel" | "clarify",
  "title": "string | null",
  "description": "string | null",
  "type": "general" | "health" | "celebration" | "career" | "life_event",
  "scheduledFor": "ISO string or null",
  "response": "string",
  "usedCurrentDatetime": "echo CURRENT_DATETIME_UTC",
  "note": "string | null"
}
`.trim();

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        temperature: 0,
        max_tokens: 700,
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: `Context: ${JSON.stringify(context)}\n\nUser response: ${inputText}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? '';
      if (!raw) throw new Error('No response from OpenAI');

      const parsed = safeJson<ParsedReminder>(raw, {
        action: 'clarify',
        title: null,
        description: null,
        type: 'general',
        scheduledFor: null,
        response: 'Please clarify.',
        usedCurrentDatetime: CURRENT_DATETIME_UTC,
        note: null,
      });

      // Enforce future
      if (typeof parsed.scheduledFor === 'string' && parsed.scheduledFor.trim()) {
        const before = parsed.scheduledFor;
        const after = ensureFutureISO(before, CURRENT_DATETIME_UTC);
        if (after !== before) {
          parsed.scheduledFor = after;
          parsed.note = (parsed.note ? parsed.note + ' ' : '') + 'Rolled past time forward to keep it in the future.';
        }
      }

      parsed.usedCurrentDatetime = CURRENT_DATETIME_UTC;
      return parsed;
    } catch (error: any) {
      console.error('Error processing reminder response:', error);
      const fallback = this.mockReminderResponse(inputText, context);
      (fallback as any).usedCurrentDatetime = nowIsoUtc();
      return fallback as ParsedReminder;
    }
  }

  // -------- Mocks --------
  mockAdvancedResponse(inputText: string) {
    return {
      intent: 'clarify',
      confidence: 0.0,
      actions: [],
      response:
        "I'm having trouble understanding your request right now. This might be due to a connection issue or the AI service being temporarily unavailable.",
      clarification:
        'Could you please try rephrasing your request? For example:\n• "Add Sarah to my contacts"\n• "Remind me to call mom tomorrow"\n• "Schedule a text to John saying happy birthday"',
    };
  }

  mockReminderResponse(_inputText: string, _context: any) {
    return {
      action: 'create',
      title: 'Mock Reminder',
      description: 'This is a mock reminder response',
      type: 'general',
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      response: 'Mock reminder created successfully!',
    };
  }
}

export const AIService = new AIServiceClass();