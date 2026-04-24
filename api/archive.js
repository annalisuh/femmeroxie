const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  const auth = req.headers.authorization;
  const validAuth = 'Basic ' + Buffer.from('admin:' + process.env.ARCHIVE_PASSWORD).toString('base64');

  if (!auth || auth !== validAuth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Roxie Archive"');
    return res.status(401).send('Access denied.');
  }

  try {
    const { rows } = await sql`
      SELECT id, session_id, timestamp, transcript, message_count
      FROM conversations
      ORDER BY timestamp DESC
      LIMIT 500
    `;

    const html = buildHTML(rows);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    if (e.message && e.message.includes('does not exist')) {
      return res.status(200).send(buildHTML([]));
    }
    console.error('Archive error:', e);
    return res.status(500).send('Archive error: ' + e.message);
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit'
  });
}

function buildHTML(rows) {
  const conversationsHTML = rows.map((row, i) => {
    const transcript = Array.isArray(row.transcript) ? row.transcript : JSON.parse(row.transcript);
    const userMsgCount = transcript.filter(m => m.role === 'user').length;
    const preview = transcript.find(m => m.role === 'user')?.content?.slice(0, 80) || '(no messages)';

    const msgsHTML = transcript.map(msg => `
      <div class="msg ${msg.role}">
        <div class="role">${msg.role === 'user' ? 'Visitor' : 'Roxie'}</div>
        <div class="content">${escapeHtml(msg.content)}</div>
      </div>
    `).join('');

    return `
      <div class="conv">
        <div class="conv-header" onclick="toggle(${i})">
          <div class="conv-meta">
            <span class="num">#${String(row.id).padStart(4, '0')}</span>
            <span class="date">${formatDate(row.timestamp)}</span>
            <span class="count">${userMsgCount} message${userMsgCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="preview">${escapeHtml(preview)}${preview.length >= 80 ? '...' : ''}</div>
          <div class="toggle-icon">+</div>
        </div>
        <div class="conv-body" id="body-${i}">
          ${msgsHTML}
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Roxie · Archive</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700&family=DM+Mono:wght@300;400;500&family=Playfair+Display:ital,wght@1,400&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --pink: #ff2ecc;
    --black: #000;
    --panel: #0a0a0a;
    --text: #e8e8e8;
    --dim: #555;
    --mid: #888;
    --border: rgba(255, 46, 204, 0.25);
    --border-faint: rgba(255, 46, 204, 0.1);
  }
  html, body {
    background: var(--black); color: var(--text);
    font-family: 'Space Grotesk', sans-serif; font-weight: 300;
    min-height: 100vh;
  }
  body::before {
    content: ''; position: fixed; inset: 0;
    background-image:
      linear-gradient(var(--border-faint) 1px, transparent 1px),
      linear-gradient(90deg, var(--border-faint) 1px, transparent 1px);
    background-size: 48px 48px;
    pointer-events: none; z-index: 0; opacity: 0.4;
  }
  .wrap { position: relative; z-index: 1; max-width: 900px; margin: 0 auto; padding: 48px 36px; }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px; margin-bottom: 32px;
    display: flex; justify-content: space-between; align-items: flex-end;
  }
  .title {
    font-size: 36px; font-weight: 700;
    letter-spacing: -0.02em; text-transform: uppercase;
  }
  .title span { color: var(--pink); }
  .sub {
    font-family: 'DM Mono', monospace; font-size: 10px;
    color: var(--mid); letter-spacing: 0.18em; text-transform: uppercase;
    margin-top: 4px;
  }
  .stats {
    font-family: 'DM Mono', monospace; font-size: 10px;
    color: var(--pink); letter-spacing: 0.15em; text-transform: uppercase;
  }
  .empty {
    text-align: center; padding: 80px 20px;
    font-family: 'Playfair Display', serif; font-style: italic;
    font-size: 18px; color: var(--mid);
  }
  .conv {
    border: 1px solid var(--border-faint);
    margin-bottom: 8px; background: var(--panel);
    transition: border-color 0.2s;
  }
  .conv:hover { border-color: var(--border); }
  .conv-header {
    padding: 16px 20px; cursor: pointer;
    display: grid; grid-template-columns: auto 1fr auto; gap: 20px;
    align-items: center;
  }
  .conv-meta {
    display: flex; flex-direction: column; gap: 2px;
    font-family: 'DM Mono', monospace; font-size: 9px;
    letter-spacing: 0.1em; text-transform: uppercase;
    min-width: 140px;
  }
  .num { color: var(--pink); font-weight: 500; }
  .date { color: var(--text); }
  .count { color: var(--mid); }
  .preview {
    font-size: 13px; color: var(--text); opacity: 0.85;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  }
  .toggle-icon {
    font-family: 'DM Mono', monospace; font-size: 18px;
    color: var(--pink); width: 24px; text-align: center;
    transition: transform 0.2s;
  }
  .conv.open .toggle-icon { transform: rotate(45deg); }
  .conv-body {
    display: none; padding: 0 20px 20px;
    border-top: 1px solid var(--border-faint);
    padding-top: 20px;
  }
  .conv.open .conv-body { display: block; }
  .msg {
    margin-bottom: 14px; padding: 12px 16px;
    font-size: 13px; line-height: 1.7;
  }
  .msg.user {
    background: rgba(255, 46, 204, 0.06);
    border-left: 2px solid var(--mid);
  }
  .msg.assistant {
    background: transparent;
    border: 1px solid var(--border-faint);
    border-left: 2px solid var(--pink);
  }
  .role {
    font-family: 'DM Mono', monospace; font-size: 8.5px;
    letter-spacing: 0.18em; text-transform: uppercase;
    margin-bottom: 6px;
  }
  .msg.user .role { color: var(--mid); }
  .msg.assistant .role { color: var(--pink); }
  .content { white-space: pre-wrap; }
  footer {
    margin-top: 60px; padding-top: 20px;
    border-top: 1px solid var(--border-faint);
    font-family: 'Playfair Display', serif; font-style: italic;
    font-size: 11px; color: var(--dim);
    display: flex; justify-content: space-between;
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <div class="title">Rox<span>i</span>e · Archive</div>
      <div class="sub">Conversations · Cyber Femme Vol. 001</div>
    </div>
    <div class="stats">${rows.length} conversation${rows.length !== 1 ? 's' : ''}</div>
  </header>

  ${rows.length === 0
    ? '<div class="empty">No conversations yet. She is waiting.</div>'
    : conversationsHTML
  }

  <footer>
    <span>She won't remember. You will.</span>
    <span style="font-family:'DM Mono',monospace; font-style:normal; letter-spacing:0.15em; text-transform:uppercase;">2026</span>
  </footer>
</div>

<script>
function toggle(i) {
  const conv = document.querySelectorAll('.conv')[i];
  conv.classList.toggle('open');
}
</script>
</body>
</html>`;
}

