const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BUILDER_PORT = 3000;
const PREVIEW_PORT = 8080;
const PREVIEW_EXTERNAL_PORT = process.env.PREVIEW_EXTERNAL_PORT || 40035;
const SITE_DIR = path.join(__dirname, 'site');

if (!fs.existsSync(SITE_DIR)) fs.mkdirSync(SITE_DIR, { recursive: true });

const builderApp = express();
builderApp.use(express.json());

const SITE_PASSWORD = process.env.SITE_PASSWORD;
if (SITE_PASSWORD) {
  builderApp.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [user, pass] = decoded.split(':');
      if (user === 'admin' && pass === SITE_PASSWORD) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="AI Website Builder"');
    res.status(401).send('Authentication required');
  });
}

builderApp.use(express.static(path.join(__dirname, 'public')));

builderApp.post('/api/generate', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENROUTER_API_KEY not set' });

  console.log(`[PROMPT] New request (${prompt.length} chars): "${prompt.substring(0, 120)}${prompt.length > 120 ? '...' : ''}"`);

  try {
    const html = await callOpenRouter(prompt, apiKey);
    fs.writeFileSync(path.join(SITE_DIR, 'index.html'), html);
    console.log(`[SAVE] Site updated (${html.length} bytes)`);
    res.json({ success: true, previewUrl: `http://${req.hostname}:${PREVIEW_EXTERNAL_PORT}` });
  } catch (err) {
    console.error(`[ERROR] OpenRouter failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

builderApp.get('/api/history', (req, res) => {
  const historyFile = path.join(SITE_DIR, 'history.json');
  if (fs.existsSync(historyFile)) {
    res.json(JSON.parse(fs.readFileSync(historyFile, 'utf8')));
  } else {
    res.json([]);
  }
});

function callOpenRouter(prompt, apiKey) {
  return new Promise((resolve, reject) => {
    const historyFile = path.join(SITE_DIR, 'history.json');
    let history = [];
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    console.log(`[OPENROUTER] History loaded: ${history.length} previous exchanges`);

    let systemMessage = `You are an expert web developer. Generate a complete, self-contained HTML file based on the user's request. 
Rules:
- Output ONLY the raw HTML. No markdown code fences, no explanations.
- Use modern CSS (flexbox/grid), responsive design.
- Include all CSS inline in <style> tags.
- Make it visually polished and professional.
- If the user asks for changes, regenerate the ENTIRE page with those changes applied.
- Reference the conversation history to understand what has been built so far.`;

    let messages = [{ role: 'system', content: systemMessage }];
    history.forEach(h => {
      messages.push({ role: 'user', content: h.prompt });
      messages.push({ role: 'assistant', content: h.response });
    });
    messages.push({ role: 'user', content: prompt });

    const body = JSON.stringify({
      model: 'anthropic/claude-sonnet-4',
      messages,
      max_tokens: 16000,
    });

    const totalMessages = messages.length;
    console.log(`[OPENROUTER] Sending request: model=anthropic/claude-sonnet-4, messages=${totalMessages}, max_tokens=16000`);
    const startTime = Date.now();

    const options = {
      hostname: 'openrouter.ai',
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'AI Website Builder',
      },
    };

    const req = https.request(options, (apiRes) => {
      console.log(`[OPENROUTER] Response status: ${apiRes.statusCode}`);
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        const elapsed = Date.now() - startTime;
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            console.error(`[OPENROUTER] API error (${elapsed}ms): ${parsed.error.message || JSON.stringify(parsed.error)}`);
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
            return;
          }
          const usage = parsed.usage;
          if (usage) {
            console.log(`[OPENROUTER] Tokens used: prompt=${usage.prompt_tokens}, completion=${usage.completion_tokens}, total=${usage.total_tokens}`);
          }
          let html = parsed.choices?.[0]?.message?.content || '';
          html = html.replace(/^```html\s*/i, '').replace(/\s*```$/i, '').trim();

          console.log(`[OPENROUTER] Response complete in ${elapsed}ms: ${html.length} chars of HTML`);

          history.push({ prompt, response: html });
          fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));

          resolve(html);
        } catch (e) {
          console.error(`[OPENROUTER] Parse failed (${elapsed}ms): ${data.substring(0, 500)}`);
          reject(new Error(`Failed to parse response: ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', (err) => {
      console.error(`[OPENROUTER] Connection error: ${err.message}`);
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

const previewApp = express();
previewApp.use(express.static(SITE_DIR));
previewApp.use((req, res) => {
  const indexPath = path.join(SITE_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send(`<!DOCTYPE html>
<html><head><title>AI Website Builder</title>
<style>body{display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;font-family:system-ui;background:#0f172a;color:#94a3b8;}</style>
</head><body><h1>Enter a prompt in the builder to generate a site</h1></body></html>`);
  }
});

builderApp.listen(BUILDER_PORT, '0.0.0.0', () => {
  console.log(`Builder UI running on port ${BUILDER_PORT}`);
});

previewApp.listen(PREVIEW_PORT, '0.0.0.0', () => {
  console.log(`Preview server running on port ${PREVIEW_PORT}`);
});
