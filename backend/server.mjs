import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

await loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const HF_TOKEN = process.env.HF_TOKEN;
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-7B-Instruct';
const HF_API_URL = 'https://router.huggingface.co/v1/chat/completions';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  : null;

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

function ensureDatabase(req, res) {
  if (supabase) return true;

  sendJson(req, res, 503, {
    error: 'Supabase belum diset. Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di backend/.env, lalu restart backend.',
  });
  return false;
}

async function handleListDocuments(req, res) {
  if (!supabase) {
    sendJson(req, res, 200, { documents: [] });
    return;
  }

  const { data, error } = await supabase
    .from('documents')
    .select('id, title, source_type, content, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    sendJson(req, res, 500, { error: error.message });
    return;
  }

  sendJson(req, res, 200, { documents: data });
}

async function handleDeleteDocument(req, res, id) {
  if (!ensureDatabase(req, res)) return;

  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    sendJson(req, res, 400, { error: 'Invalid document ID.' });
    return;
  }

  const { error } = await supabase.from('documents').delete().eq('id', id);

  if (error) {
    sendJson(req, res, 500, { error: error.message });
    return;
  }

  sendJson(req, res, 200, { ok: true });
}

async function handleCreateDocument(req, res) {
  if (!ensureDatabase(req, res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(req, res, 400, { error: 'Invalid JSON request body.' });
    return;
  }

  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const sourceType = body.sourceType === 'manual' ? 'manual' : 'upload';

  if (!title || !content) {
    sendJson(req, res, 400, { error: 'Document title and content are required.' });
    return;
  }

  const { data, error } = await supabase
    .from('documents')
    .insert({
      title,
      content,
      source_type: sourceType,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
    })
    .select('id,title,source_type,created_at')
    .single();

  if (error) {
    sendJson(req, res, 500, { error: error.message });
    return;
  }

  sendJson(req, res, 201, { document: data });
}

async function ensureChatSession(sessionId, title) {
  if (!supabase) return null;

  if (sessionId) {
    const { data, error } = await supabase
      .from('chat_sessions')
      .upsert({ id: sessionId, title: title || 'FAT Assistant Chat' }, { onConflict: 'id' })
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ title: title || 'FAT Assistant Chat' })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

async function saveChatMessage(sessionId, role, content, metadata = {}) {
  if (!supabase || !sessionId || !content) return;

  const { error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      metadata,
    });

  if (error) throw error;
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
    let sessionId = body.sessionId || null;

    if (supabase) {
      sessionId = await ensureChatSession(
        sessionId,
        question.length > 80 ? `${question.slice(0, 77)}...` : question,
      );
      await saveChatMessage(sessionId, 'user', question, {
        hasKnowledgeBase: Boolean(String(body.knowledgeBase || '').trim()),
      });
      await saveChatMessage(sessionId, 'assistant', answer || 'The model did not return an answer.', {
        model: HF_MODEL,
      });
    }

    sendJson(req, res, 200, {
      answer: answer || 'The model did not return an answer.',
      model: HF_MODEL,
      sessionId,
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
      hasSupabase: Boolean(supabase),
    });
    return;
  }

  if (req.url?.startsWith('/api/documents')) {
    if (req.method === 'GET') {
      await handleListDocuments(req, res);
    } else if (req.method === 'POST') {
      await handleCreateDocument(req, res);
    } else if (req.method === 'DELETE') {
      const id = req.url.slice('/api/documents/'.length);
      await handleDeleteDocument(req, res, id);
    } else {
      sendJson(req, res, 405, { error: 'Method not allowed.' });
    }
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
