import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

await loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';

async function loadEnvFile() {
  try {
    const content = await readFile(join(__dirname, '.env'), 'utf8');

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) continue;

      const key = trimmed.slice(0, equalsIndex).trim();
      const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env is optional. Production hosts usually provide environment variables directly.
  }
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  const allowedOrigins = ALLOWED_ORIGIN.split(',').map((item) => item.trim());

  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
    res.setHeader('access-control-allow-origin', allowedOrigins.includes('*') ? '*' : origin);
  }

  res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,authorization');
}

function sendJson(req, res, status, data) {
  setCorsHeaders(req, res);
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
    sendJson(req, res, 500, {
      error: 'HF_TOKEN belum diset. Buat file backend/.env dari backend/.env.example, isi token Hugging Face, lalu restart backend.',
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(req, res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const question = String(body.question || '').trim();
  if (!question) {
    sendJson(req, res, 400, { error: 'Question is required.' });
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
      sendJson(req, res, hfResponse.status, {
        error: getHuggingFaceError(payload) || `Hugging Face request failed with status ${hfResponse.status}.`,
      });
      return;
    }

    const answer = payload.choices?.[0]?.message?.content;
    sendJson(req, res, 200, {
      answer: answer || 'The model did not return an answer.',
      model: HF_MODEL,
    });
  } catch (error) {
    sendJson(req, res, 502, {
      error: error instanceof Error ? error.message : 'Failed to contact Hugging Face.',
    });
  }
}

function getHuggingFaceError(payload) {
  if (!payload) return '';
  if (typeof payload.error === 'string') return payload.error;
  if (typeof payload.error?.message === 'string') return payload.error.message;
  if (typeof payload.message === 'string') return payload.message;
  return '';
}

createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(req, res, 200, {
      ok: true,
      model: HF_MODEL,
      hasToken: Boolean(HF_TOKEN),
    });
    return;
  }

  if (req.method === 'POST' && req.url?.startsWith('/api/chat')) {
    await handleChat(req, res);
    return;
  }

  sendJson(req, res, 404, { error: 'Not found.' });
}).listen(PORT, () => {
  console.log(`FAT Assistant backend running at http://localhost:${PORT}`);
  console.log(`Using Hugging Face model: ${HF_MODEL}`);
});
