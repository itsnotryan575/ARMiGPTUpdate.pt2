import OpenAI from 'openai';

// Initialize OpenAI client - will fallback to mock if API key is not available
let openai: OpenAI | null = null;

try {
  // Only initialize if we have a valid API key
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (apiKey && apiKey.startsWith('sk-')) {
    openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });
  }
} catch (error) {
  console.log('OpenAI not available, using mock responses');
}

class AIServiceClass {
  async processInteraction(inputText: string) {
    try {
      // Check if OpenAI is available
      if (!openai) {
        console.log('OpenAI not configured, using mock processing');
        return this.mockAdvancedResponse(inputText);
      }

      // Use GPT-4o for advanced natural language understanding
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are ARMi (Artificial Relationship Management Intelligence), an advanced AI assistant that helps users manage their relationships through natural language commands. You excel at understanding complex, informal, slang, and formal requests to perform various relationship management tasks.

🎯 YOUR CORE CAPABILITIES:
1. CREATE/UPDATE PROFILES: Add new people or update existing ones with comprehensive details
2. CREATE REMINDERS: Set up reminders for follow-ups, birthdays, important events
3. SCHEDULE TEXTS: Schedule text messages to be sent at specific times
4. CLARIFY REQUESTS: Ask for more information when requests are unclear

🧠 INTELLIGENCE GUIDELINES:
- Understand slang, informal language, abbreviations, and context clues
- Make smart inferences from context (e.g., "met Sarah at a club" → Sarah likely enjoys nightlife/clubs)
- Extract ALL available information but NEVER assume details not present or implied
- Handle multi-intent requests (e.g., "Add John to my contacts and remind me to call him tomorrow")
- Parse natural language dates/times into proper formats
- Distinguish between creating new profiles vs updating existing ones

🔍 EXTRACTION RULES:
- NAMES: Extract EXACTLY as written - preserve spelling, capitalization, nicknames
- AGE: Only if explicitly mentioned as a number (e.g., "she's 25", "around 30")
- RELATIONSHIPS: Map to: family/friend/partner/coworker/neighbor/acquaintance
- PREFERENCES: Infer likes/dislikes from context and activities mentioned
- CONTACT INFO: Extract phone numbers, emails, social media handles
- FAMILY: Extract kids, siblings, parents only if mentioned
- WORK: Extract job titles, companies, career details
- DATES/TIMES: Parse natural language into ISO 8601 format

📋 RESPONSE FORMAT:
Always return a JSON object with this exact structure:

{
  "intent": "create_profile" | "update_profile" | "create_reminder" | "schedule_text" | "multi_action" | "clarify",
  "confidence": number (0.0-1.0),
  "actions": [
    {
      "type": "create_profile" | "update_profile" | "create_reminder" | "schedule_text",
      "data": {
        // Profile data for create_profile/update_profile
        "name": "string (REQUIRED for profiles)",
        "age": number | null,
        "phone": "string | null",
        "email": "string | null", 
        "relationship": "family|friend|partner|coworker|neighbor|acquaintance",
        "job": "string | null",
        "notes": "string | null",
        "tags": ["array of descriptive tags"],
        "kids": ["array of children names/descriptions"],
        "siblings": ["array of sibling names"],
        "parents": ["array of parent names"],
        "likes": ["array of things they enjoy"],
        "dislikes": ["array of things they dislike"],
        "interests": ["array of hobbies/interests"],
        "instagram": "string | null",
        "snapchat": "string | null", 
        "twitter": "string | null",
        "tiktok": "string | null",
        "facebook": "string | null",
        "birthday": "string | null (MM/DD/YYYY format)",
        "lastContactDate": "ISO date string",
        
        // Reminder data for create_reminder
        "title": "string (REQUIRED for reminders)",
        "description": "string | null",
        "reminderType": "general|health|celebration|career|life_event",
        "scheduledFor": "ISO date string (REQUIRED for reminders)",
        "profileId": number | null,
        
        // Scheduled text data for schedule_text
        "phoneNumber": "string (REQUIRED for texts)",
        "message": "string (REQUIRED for texts)",
        "scheduledFor": "ISO date string (REQUIRED for texts)",
        "profileId": number | null
      }
    }
  ],
  "response": "string (conversational response to user)",
  "clarification": "string | null (what you need clarified if intent is 'clarify')"
}

🎯 INTENT DETECTION EXAMPLES:

CREATE_PROFILE:
- "I met Sarah at the gym yesterday"
- "Add my coworker Mike to my contacts"
- "New person: Jennifer, 28, works at Google"

UPDATE_PROFILE:
- "Update Sarah's job to marketing manager"
- "Mike got a new phone number: 555-1234"
- "Add a note to Jennifer that she loves hiking"

CREATE_REMINDER:
- "Remind me to call mom next week"
- "Set a reminder to follow up with Sarah in 3 days"
- "Birthday reminder for Mike on March 15th"

SCHEDULE_TEXT:
- "Schedule a text to Sarah tomorrow saying 'Happy birthday!'"
- "Send Mike a message next Friday at 2pm"
- "Text Jennifer 'How was your vacation?' on Monday"

MULTI_ACTION:
- "Add Sarah to my contacts and remind me to call her tomorrow"
- "Update Mike's job and schedule a congratulations text"

CLARIFY:
- "Do something with Sarah" (unclear intent)
- "Remind me about that thing" (missing details)

🕐 DATE/TIME PARSING:
Convert natural language to ISO 8601:
- "tomorrow" → next day at 12:00 PM
- "next week" → 7 days from now at 12:00 PM  
- "Friday at 3pm" → next Friday at 3:00 PM
- "in 2 hours" → current time + 2 hours
- "March 15th" → March 15th of current/next year at 12:00 PM

🎨 SMART INFERENCE EXAMPLES:
- "met at a club" → tags: ["social"], likes: ["nightlife", "dancing"]
- "works at Google" → job: "Software Engineer" (if not specified), tags: ["tech"]
- "has twin boys" → kids: ["twin boy 1", "twin boy 2"], tags: ["parent"]
- "loves hiking" → likes: ["hiking"], interests: ["outdoors"], tags: ["outdoorsy"]
- "can't stand spicy food" → dislikes: ["spicy food"]

Remember: Be intelligent but not presumptuous. Extract what's clearly stated or strongly implied, but don't fabricate details.`
          },
          {
            role: "user",
            content: inputText
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      // Parse the JSON response
      const parsedResponse = JSON.parse(response);
      
      console.log('🤖 AI Response:', parsedResponse);
      
      return parsedResponse;
    } catch (error) {
      console.error('Error processing with OpenAI:', error);
      
      // Fallback to mock processing if API fails
      return this.mockAdvancedResponse(inputText);
    }
  }

  async processReminderResponse(inputText: string, context: any) {
    try {
      if (!openai) {
        return this.mockReminderResponse(inputText, context);
      }

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are ARMi, helping users manage reminder responses. The user is responding to a reminder suggestion with natural language.

CONTEXT: The user was suggested a reminder and is now responding naturally with their preferences.

Your job is to:
1. Parse their response to understand what they want
2. Extract specific dates/times if mentioned
3. Determine if they want to create the reminder or not
4. Handle complex natural language like "set it for next Thursday at 4pm" or "yes that works perfect"
5. Return structured data for reminder creation

Return JSON in this format:
{
  "action": "create" | "cancel" | "clarify",
  "title": "string (reminder title)",
  "description": "string (reminder description)", 
  "type": "string (general/health/celebration/career/life_event)",
  "scheduledFor": "ISO date string or null",
  "response": "string (conversational response to user)"
}

Handle natural language time expressions like:
- "tomorrow", "next week", "next Thursday", "in 3 days"
- "at 4pm", "at 2:30", "in the morning", "this evening"
- "yes", "sure", "that works", "sounds good" (use suggested timing)
- "no", "nah", "not now", "maybe later" (cancel)
- "yes but...", "sure but...", "that works but..." (modify the suggestion)

Always be conversational and confirm the user's intent clearly.`
          },
          {
            role: "user",
            content: `Context: ${JSON.stringify(context)}\n\nUser response: ${inputText}`
          }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      return JSON.parse(response);
    } catch (error) {
      console.error('Error processing reminder response:', error);
      throw new Error(`AI reminder processing failed: ${error.message}`);
    }
  }

  mockAdvancedResponse(inputText: string) {
    const positiveWords = ['happy', 'great', 'awesome', 'good', 'excited', 'love', 'amazing', 'wonderful', 'fantastic'];
    const negativeWords = ['sad', 'upset', 'difficult', 'hard', 'worried', 'stressed', 'surgery', 'problem', 'trouble', 'sick'];
    
    const lowerText = inputText.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  mockReminderResponse(inputText: string, context: any) {
    return {
      action: 'create',
      title: 'Mock Reminder',
      description: 'This is a mock reminder response',
      type: 'general',
      scheduledFor: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      response: 'Mock reminder created successfully!'
    };
  }
}

export const AIService = new AIServiceClass();