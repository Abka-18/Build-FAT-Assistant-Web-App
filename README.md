
  # Build FAT Assistant Web App

  This is a code bundle for Build FAT Assistant Web App. The original project is available at https://www.figma.com/design/IdUtnME0haoIeeRZEdv9hZ/Build-FAT-Assistant-Web-App.

  ## Running the code

  Install frontend dependencies:

  ```bash
  npm i
  ```

  Create a Hugging Face token with Inference Providers access, then copy `backend/.env.example` to `backend/.env` and fill in your token:

  ```env
  HF_TOKEN=hf_your_huggingface_token_here
  HF_MODEL=Qwen/Qwen2.5-7B-Instruct
  PORT=8787
  ALLOWED_ORIGIN=http://localhost:5173
  SUPABASE_URL=https://your-project-ref.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
  ```

  Run the SQL in `backend/supabase/schema.sql` inside the Supabase SQL Editor before using database features.

  Run the backend in one terminal:

  ```bash
  cd backend
  npm run dev
  ```

  Run the frontend in another terminal:

  ```bash
  npm run dev
  ```

  Open the URL shown by Vite, usually `http://localhost:5173`.

  For production frontend build:

  ```bash
  npm run build
  ```
  
