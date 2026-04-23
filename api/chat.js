import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { messages, system, sessionId } = req.body;

    // Call Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system,
        messages
      })
    });

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // Save conversation to database — fire and forget (don't block response)
    saveConversation(sessionId, messages, reply).catch(err => {
      console.error('Save failed:', err);
    });

    res.status(200).json(data);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}

async function saveConversation(sessionId, messages, reply) {
  if (!sessionId) return;

  // Create table if it doesn't exist (runs once, then no-op)
  await sql`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(64) NOT NULL UNIQUE,
      timestamp TIMESTAMP DEFAULT NOW(),
      transcript JSONB NOT NULL,
      message_count INT NOT NULL
    )
  `;

  // Build full transcript with the new reply appended
  const fullTranscript = [
    ...messages,
    { role: 'assistant', content: reply }
  ];

  // Upsert — update if session_id exists, insert if new
  await sql`
    INSERT INTO conversations (session_id, transcript, message_count)
    VALUES (${sessionId}, ${JSON.stringify(fullTranscript)}, ${fullTranscript.length})
    ON CONFLICT (session_id) DO UPDATE
      SET transcript = ${JSON.stringify(fullTranscript)},
          message_count = ${fullTranscript.length},
          timestamp = NOW()
  `;
}
