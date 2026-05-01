import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
}

function buildMessages(question, knowledgeBase) {
  const kb = String(knowledgeBase || '').trim();

  return [
    {
      role: 'system',
      content:
        'You are FAT Assistant, a concise assistant for finance, accounting, tax workflows, SOPs, contacts, and internal knowledge base questions. Answer in the same language as the user. If the answer is not supported by the provided knowledge base, say that clearly and ask for the missing document or detail.',
    },
    {
      role: 'user',
      content: `Knowledge base:\n${kb || '(No knowledge base provided)'}\n\nUser question:\n${question}`,
    },
  ];
}

async function handleChat(req, res) {
  if (!HF_TOKEN) {
    sendJson(res, 500, {
      error: 'HF_TOKEN is not configured. Add your Hugging Face token to the environment before starting the server.',
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const question = String(body.question || '').trim();
  if (!question) {
    sendJson(res, 400, { error: 'Question is required.' });
    return;
  }

  try {
    const hfResponse = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${HF_TOKEN}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: buildMessages(question, body.knowledgeBase),
        temperature: 0.2,
        max_tokens: 700,
      }),
    });

    const payload = await hfResponse.json().catch(() => ({}));

    if (!hfResponse.ok) {
      sendJson(res, hfResponse.status, {
        error: payload.error?.message || payload.error || 'Hugging Face request failed.',
      });
      return;
    }

    const answer = payload.choices?.[0]?.message?.content;
    sendJson(res, 200, {
      answer: answer || 'The model did not return an answer.',
      model: HF_MODEL,
    });
  } catch (error) {
    sendJson(res, 502, {
      error: error instanceof Error ? error.message : 'Failed to contact Hugging Face.',
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(__dirname, 'dist', safePath);

  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      'content-type': mimeTypes[extname(filePath)] || 'application/octet-stream',
    });
    res.end(file);
  } catch {
    try {
      const fallback = await readFile(join(__dirname, 'dist', 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fallback);
    } catch {
      sendJson(res, 404, {
        error: 'Build output not found. Run npm run build first, or use npm run dev with npm run api.',
      });
    }
  }
}

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url?.startsWith('/api/chat')) {
    await handleChat(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    await serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed.' });
}).listen(PORT, () => {
  console.log(`FAT Assistant server running at http://localhost:${PORT}`);
  console.log(`Using Hugging Face model: ${HF_MODEL}`);
});
