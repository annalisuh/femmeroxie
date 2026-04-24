const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, system, sessionId } = req.body;

    if (!messages || !system) {
      return res.status(400).json({ error: 'Missing messages or system' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'API key not configured' });
    }

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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(response.status).json({ 
        error: 'Anthropic API error', 
        status: response.status 
      });
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || '';

    // Save conversation in background — don't block or fail the response
    if (sessionId && reply) {
      saveConversation(sessionId, messages, reply).catch(err => {
        console.error('DB save failed (non-fatal):', err.message);
      });
    }

    return res.status(200).json(data);
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
};

async function saveConversation(sessionId, messages, reply) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL UNIQUE,
        timestamp TIMESTAMP DEFAULT NOW(),
        transcript JSONB NOT NULL,
        message_count INT NOT NULL
      )
    `;

    const fullTranscript = [
      ...messages,
      { role: 'assistant', content: reply }
    ];

    await sql`
      INSERT INTO conversations (session_id, transcript, message_count)
      VALUES (${sessionId}, ${JSON.stringify(fullTranscript)}, ${fullTranscript.length})
      ON CONFLICT (session_id) DO UPDATE
        SET transcript = ${JSON.stringify(fullTranscript)},
            message_count = ${fullTranscript.length},
            timestamp = NOW()
    `;
  } catch (err) {
    console.error('Save conversation error:', err.message);
    throw err;
  }
}

