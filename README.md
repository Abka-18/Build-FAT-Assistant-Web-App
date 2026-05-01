
  # Build FAT Assistant Web App

  This is a code bundle for Build FAT Assistant Web App. The original project is available at https://www.figma.com/design/IdUtnME0haoIeeRZEdv9hZ/Build-FAT-Assistant-Web-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Create a Hugging Face token with Inference Providers access, then copy `.env.example` to `.env` and fill in your token:

  ```env
  HF_TOKEN=hf_your_huggingface_token_here
  HF_MODEL=Qwen/Qwen2.5-7B-Instruct
  ```

  Run the Vite app and Hugging Face API proxy together:

  ```bash
  npm run dev
  ```

  Open the URL shown by Vite, usually `http://localhost:5173`.

  To run only the API proxy:

  ```bash
  npm run api
  ```

  For production, build the web app and start the server:

  ```bash
  npm run build
  npm start
  ```
  
