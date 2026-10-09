export interface User {
  id: string;
  email: string;
}

export type DocumentStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface StudyDocument {
  id: string;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  status: DocumentStatus;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  documentId: string;
  filename: string;
  pageNumber: number;
  quote: string;
}

export interface StudyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[];
  answerMode: 'extractive' | 'generated' | null;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
}

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

interface ApiErrorBody {
  error?: { message?: string };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (response.status === 204) return undefined as T;

  let payload: { data?: T } & ApiErrorBody;
  try {
    payload = await response.json() as { data?: T } & ApiErrorBody;
  } catch {
    throw new ApiRequestError('The server returned an unreadable response.', response.status);
  }
  if (!response.ok) {
    throw new ApiRequestError(payload.error?.message || 'The request could not be completed.', response.status);
  }
  return payload.data as T;
}

function post<T>(path: string, value?: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
  });
}

export const api = {
  me: () => request<{ user: User }>('/auth/me'),
  register: (email: string, password: string) => post<{ user: User }>('/auth/register', { email, password }),
  login: (email: string, password: string) => post<{ user: User }>('/auth/login', { email, password }),
  logout: () => post<void>('/auth/logout'),
  documents: () => request<{ documents: StudyDocument[] }>('/documents'),
  upload: (file: File, onProgress: (percent: number) => void) => uploadDocument(file, onProgress),
  retryDocument: (id: string) => post<{ document: StudyDocument }>(`/documents/${encodeURIComponent(id)}/retry`),
  deleteDocument: (id: string) => request<void>(`/documents/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  conversations: () => request<{ conversations: Conversation[] }>('/conversations'),
  createConversation: (documentIds: string[] = []) => post<{ conversation: Conversation }>('/conversations', { documentIds }),
  conversationMessages: (id: string) => request<{ conversation: Conversation; messages: StudyMessage[] }>(`/conversations/${encodeURIComponent(id)}/messages`),
  renameConversation: (id: string, title: string) => request<{ conversation: Conversation }>(`/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
    headers: { 'content-type': 'application/json' },
  }),
  deleteConversation: (id: string) => request<void>(`/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  chat: (input: { message: string; documentIds: string[]; conversationId?: string }) => post<{
    conversation: Conversation;
    userMessage: StudyMessage;
    assistantMessage: StudyMessage;
  }>('/chat', input),
};

function uploadDocument(file: File, onProgress: (percent: number) => void): Promise<StudyDocument> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/documents');
    xhr.withCredentials = true;
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    });
    xhr.addEventListener('error', () => reject(new ApiRequestError('Network error while uploading. Check your connection and try again.', 0)));
    xhr.addEventListener('abort', () => reject(new ApiRequestError('The upload was cancelled.', 0)));
    xhr.addEventListener('load', () => {
      let payload: { data?: { document?: StudyDocument } } & ApiErrorBody;
      try {
        payload = JSON.parse(xhr.responseText) as { data?: { document?: StudyDocument } } & ApiErrorBody;
      } catch {
        reject(new ApiRequestError('The server returned an unreadable response.', xhr.status));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300 || !payload.data?.document) {
        reject(new ApiRequestError(payload.error?.message || 'The upload could not be completed.', xhr.status));
        return;
      }
      resolve(payload.data.document);
    });

    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}
