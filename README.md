
  # Build FAT Assistant Web App

  This is a code bundle for Build FAT Assistant Web App. The original project is available at https://www.figma.com/design/IdUtnME0haoIeeRZEdv9hZ/Build-FAT-Assistant-Web-App.

  ## Running the code

  Run `npm i` to install the dependencies.

  Create a Hugging Face token with Inference Providers access, then set it in your environment:

  ```bash
  HF_TOKEN=hf_your_huggingface_token_here
  HF_MODEL=Qwen/Qwen2.5-7B-Instruct
  ```

  In one terminal, run the Hugging Face API proxy:

  ```bash
  npm run api
  ```

  In another terminal, run the Vite development server:

  ```bash
  npm run dev
  ```

  For production, build the web app and start the server:

  ```bash
  npm run build
  npm start
  ```
  
