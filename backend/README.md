# FAT Assistant Backend

Node.js backend service for FAT Assistant. It proxies chat requests to Hugging Face Inference Providers using `Qwen/Qwen2.5-7B-Instruct`.

## Setup

Copy `.env.example` to `.env`, then fill in your Hugging Face token:

```env
HF_TOKEN=hf_your_huggingface_token_here
HF_MODEL=Qwen/Qwen2.5-7B-Instruct
PORT=8787
ALLOWED_ORIGIN=http://localhost:5173
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

## Database

Create a Supabase project, open the SQL Editor, then run:

```sql
-- backend/supabase/schema.sql
```

The schema creates:

- `documents` for uploaded files and manual memory
- `chat_sessions` for chat sessions
- `chat_messages` for user and assistant messages

Use the backend service role key only on the server. Do not put it in the frontend.

## Run

```bash
npm run dev
```

Health check:

```bash
GET http://localhost:8787/health
```
