# Pagewise — AI PDF Study Assistant

Pagewise is a MERN study workspace for text-based PDFs. Upload a document, select one or more sources, ask a question, and follow each answer back to the PDF page it came from. Conversations and document records are scoped to the signed-in user.

> **Project status:** the first end-to-end version is implemented. Local development uses lexical hashed-token vectors and extractive evidence replies by default, so no AI API key is needed for the core study flow. These local modes are not neural embeddings or generated LLM answers. Configure compatible chat and embedding APIs for generated explanations and stronger semantic retrieval.

## What’s in the first version

- Responsive React + Vite workspace with a PDF library, study room, citation preview, and chat history.
- Email/password registration and login with a password hash and an HTTP-only, `SameSite=Strict` session cookie.
- PDF upload with progress, file-size/type/signature checks, page limits, processing states, safe retry, and private on-demand PDF viewing.
- Page-by-page text extraction, page-preserving overlapping chunks, configurable embeddings, and exact cosine vector retrieval over only the current owner’s selected documents.
- Evidence-only local answers or optional OpenAI-compatible chat generation; returned citation markers are checked against retrieved chunks.
- MongoDB ownership filters for documents, chunks, conversations, messages, and citations; rate limits, request validation, origin checks, and centralized safe errors.
- Tests for PDF extraction, chunk/page metadata, vector ranking and owner/document filters, citation validation, health responses, and unauthenticated access.

## Requirements

- Node.js **22.13 or newer** (PDF.js 6 requires this runtime range).
- npm 10 or newer.
- A reachable MongoDB server. The app does not provision a database. MongoDB Community Server can be used locally; a managed MongoDB service is another option. Check the selected service’s current terms and limits yourself.

## Run locally

1. Start MongoDB, then copy the example environment file:

   ```sh
   cp .env.example .env
   ```

   On Windows PowerShell, use `Copy-Item .env.example .env`.

2. Edit `.env`. Set a private session secret of at least 32 characters; for example, generate one with:

   ```sh
   openssl rand -base64 32
   ```

   The example Mongo URI is for a local database:

   ```dotenv
   MONGODB_URI=mongodb://127.0.0.1:27017/pdf_study_assistant
   SESSION_SECRET=paste-a-new-random-secret-here
   ```

3. Install and start both apps from the repository root:

   ```sh
   npm install
   npm run dev
   ```

   - Web client: `http://localhost:5173`
   - API and health check: `http://localhost:4000/api/health`

   Vite proxies relative `/api` requests to the backend. Browser code does not call a hard-coded localhost API URL.

4. Create an account with an email and a password of at least 12 characters. Upload a text-based PDF (15 MB and 300 pages maximum by default), wait for **Ready to study**, select it in the study room, and ask a question.

### Production build and start

```sh
npm run lint
npm test
npm run build
npm start
```

The Express server serves `client/dist` when it exists. Set `NODE_ENV=production`, use HTTPS, and set `CLIENT_ORIGIN` to the exact public origin serving the client. Keep the database private and configure an appropriate reverse proxy and durable storage for uploaded files before deployment.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | `development`, `test`, or `production`; defaults to `development`. |
| `PORT` | No | API port; defaults to `4000`. |
| `CLIENT_ORIGIN` | No | Exact browser origin allowed for credentialed API requests; defaults to Vite’s `http://localhost:5173`. |
| `MONGODB_URI` | **Yes** | MongoDB connection string. Never commit credentials in it. |
| `SESSION_SECRET` | **Yes** | Private random secret, at least 32 characters. |
| `UPLOAD_DIR` | No | Server-side PDF storage directory; defaults to `.data/uploads` under the project root. |
| `MAX_UPLOAD_MB` | No | Server upload size limit; defaults to `15` (valid range `1`–`100`). |
| `VITE_MAX_UPLOAD_MB` | No | Client-side upload hint; defaults to `15`. Keep it aligned with `MAX_UPLOAD_MB`. |
| `MAX_PDF_PAGES` | No | Page limit; defaults to `300`. |
| `EMBEDDING_PROVIDER` | No | `local-hash` (default) or `openai-compatible`. |
| `CHAT_PROVIDER` | No | `extractive` (default) or `openai-compatible`. |
| `EMBEDDING_BASE_URL` | If remote embeddings | Base URL for an API exposing an OpenAI-compatible `/embeddings` endpoint. |
| `EMBEDDING_API_KEY` | If required by provider | Embedding API key; may be blank for a local service. |
| `EMBEDDING_MODEL` | If remote embeddings | Exact model ID supported by the chosen service. |
| `CHAT_BASE_URL` | If remote chat | Base URL for an API exposing an OpenAI-compatible `/chat/completions` endpoint. |
| `CHAT_API_KEY` | If required by provider | Chat API key; may be blank for a local service. |
| `CHAT_MODEL` | If remote chat | Exact chat model ID supported by the chosen service. |
| `AI_REQUEST_TIMEOUT_MS` | No | Per-request timeout; defaults to `30000` ms. |
| `RAG_TOP_K` | No | Maximum retrieved chunks per question; defaults to `5`. |
| `RAG_MAX_CANDIDATES` | No | Maximum stored chunks scanned for a selected-document query; defaults to `5000`. |
| `RAG_MIN_SCORE` | No | Minimum cosine score; defaults to `0.08`. Tune against your embedding model and corpus. |

The server validates configuration at startup and refuses non-HTTPS remote AI base URLs (localhost is allowed for local models). Chat and embedding providers can use different base URLs, keys, and model IDs. The implementation expects the provider’s OpenAI-compatible request/response shape; other provider protocols need an adapter.

No provider, model ID, free tier, quota, or retention policy is promised by this project. Check the provider’s current official documentation and terms before configuring it. When remote providers are enabled, selected excerpts, the question, and bounded conversation context are sent to that provider; the full PDF is not sent. Review the provider’s data-handling terms before uploading sensitive material.

## Retrieval modes and limitations

- **Local default:** a deterministic 384-dimension feature-hash vectorizer uses words and adjacent word pairs, and retrieval performs exact cosine scoring over stored chunks. It is lexical and less capable than a neural embedding model; it is intended for local development and smaller libraries. The UI marks the resulting evidence excerpts as **Extractive**.
- **Remote option:** select `openai-compatible` separately for embeddings and/or chat and configure supported endpoints and model IDs. Embedding profile identifiers are kept with chunks so vectors from different models are not mixed. Existing documents need to be reprocessed after changing the embedding provider/model; for this initial version, remove and upload those PDFs again.
- The local vector scan is bounded by `RAG_MAX_CANDIDATES`; it is not an approximate-nearest-neighbor index and is not intended for large corpora. Atlas Vector Search and other persistent vector indexes are not wired in yet.
- Scanned/image-only PDFs need OCR, which is not included. Password-protected, malformed, or over-limit PDFs fail with a readable status and can be retried after correcting the cause.
- Processing runs asynchronously in the API process, not in a durable queue. If the server exits mid-processing, retry the document from the library.
- Chat responses are not streamed. Email verification, password reset, flashcards, quizzes, and study-note generation are not included in this first version.

## API outline

All routes are under `/api`; authenticated routes use the `pagewise_session` HTTP-only cookie.

- `GET /health`
- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /documents`, `POST /documents`, `GET /documents/:id/status`, `POST /documents/:id/retry`, `GET /documents/:id/file`, `DELETE /documents/:id`
- `GET /conversations`, `POST /conversations`, `GET /conversations/:id/messages`, `PATCH /conversations/:id`, `DELETE /conversations/:id`
- `POST /chat`

IDs are always queried with the authenticated owner. A missing or foreign-owned resource is reported as not found rather than revealing another account’s data.

## Data, privacy, and deletion

- MongoDB stores account records, document metadata, extracted text chunks/vectors, conversations, messages, and citation snapshots. Password hashes are stored instead of passwords.
- PDF binaries are stored on disk under `UPLOAD_DIR`; `.data/`, `.env`, uploads, build output, and dependency folders are ignored by Git. Back up the upload directory and database together if persistence is required.
- Deleting a PDF removes its stored file, extracted chunks/vectors, and citation references, and removes it from conversation source lists. Existing conversation text remains until that conversation is deleted; a prior answer may quote document content. Deleting a conversation removes its messages.
- Logs intentionally avoid request bodies, passwords, API keys, and raw PDF text. Configure access controls, backups, and retention for the database, upload directory, and any remote AI provider.

## Repository structure

```text
client/                 React + Vite application
server/src/             Express API, Mongo models, PDF/RAG services
server/src/services/    PDF extraction, chunking, providers, vector search
PROJECT_PROMPT.md       Master product requirements
.env.example            Safe configuration template
```
