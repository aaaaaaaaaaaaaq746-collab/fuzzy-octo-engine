import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Clock3, FileText, LoaderCircle, MessageSquareText, MoreHorizontal, Plus, RefreshCw, ShieldCheck, Trash2, UploadCloud, X } from 'lucide-react';
import { api, ApiRequestError, type Conversation, type StudyDocument } from '../lib/api';

const maxUploadMb = Number(import.meta.env.VITE_MAX_UPLOAD_MB || 15);

function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function StatusBadge({ status }: { status: StudyDocument['status'] }) {
  const labels = { queued: 'In queue', processing: 'Reading PDF', ready: 'Ready to study', failed: 'Needs attention' };
  return <span className={`status-badge status-${status}`}><span className="status-dot" />{labels[status]}</span>;
}

export function LibraryPage() {
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<StudyDocument | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    const load = async () => {
      try {
        const [documentResult, conversationResult] = await Promise.all([api.documents(), api.conversations()]);
        if (!active) return;
        setDocuments(documentResult.documents);
        setConversations(conversationResult.conversations.slice(0, 4));
        setError('');
        if (documentResult.documents.some((document) => document.status === 'queued' || document.status === 'processing')) {
          timer = window.setTimeout(load, 2_000);
        }
      } catch (caught) {
        if (active) setError(caught instanceof ApiRequestError ? caught.message : 'Your library could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [refreshToken]);

  const handleFile = useCallback(async (file?: File) => {
    if (!file) return;
    setNotice('');
    setError('');
    if (!file.name.toLocaleLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      setError('Choose a PDF file to add it to your library.');
      return;
    }
    if (file.size > maxUploadMb * 1_000_000) {
      setError(`That file is larger than the ${maxUploadMb} MB upload limit.`);
      return;
    }
    setUploadProgress(0);
    try {
      const document = await api.upload(file, setUploadProgress);
      setDocuments((current) => [document, ...current]);
      setNotice(`${document.filename} is in the queue. We’ll let you know when it’s ready.`);
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'The PDF could not be uploaded. Try again.');
    } finally {
      setUploadProgress(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }, []);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files[0]);
  }

  async function retry(document: StudyDocument) {
    setBusyId(document.id);
    setError('');
    try {
      await api.retryDocument(document.id);
      setRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Retry could not be started.');
    } finally {
      setBusyId(null);
    }
  }

  async function remove(document: StudyDocument) {
    if (!window.confirm(`Remove “${document.filename}” and its extracted study data?`)) return;
    setBusyId(document.id);
    try {
      await api.deleteDocument(document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setNotice(`${document.filename} was removed from your library.`);
      if (preview?.id === document.id) setPreview(null);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'The PDF could not be removed.');
    } finally {
      setBusyId(null);
    }
  }

  const readyCount = documents.filter((document) => document.status === 'ready').length;
  const pageCount = documents.reduce((total, document) => total + document.pageCount, 0);

  return (
    <div className="library-page">
      <section className="library-welcome">
        <div className="welcome-copy">
          <span className="section-eyebrow"><span className="eyebrow-line" /> YOUR KNOWLEDGE, IN ONE PLACE</span>
          <h2>Good to see you.<br /><span>What are we learning?</span></h2>
          <p>Bring a PDF into your library. Pagewise keeps your questions close to the source.</p>
          <button className="button button-dark" onClick={() => fileInput.current?.click()}>
            <Plus size={17} aria-hidden="true" /> Add a PDF
          </button>
        </div>
        <div className="welcome-art" aria-hidden="true">
          <div className="art-ring art-ring-one" />
          <div className="art-ring art-ring-two" />
          <div className="art-page art-page-back"><span /><span /><span /></div>
          <div className="art-page art-page-front"><span className="art-page-label">PAGE 08</span><span className="art-page-title" /><span /><span /><span className="art-highlight" /><span /></div>
          <div className="art-note"><SparkleMark /> <span>Learn with context</span></div>
        </div>
      </section>

      <div className="overview-strip" aria-label="Library overview">
        <div className="overview-item"><span className="overview-icon mint"><BookOpen size={17} /></span><span><strong>{documents.length}</strong><small>PDFs in your library</small></span></div>
        <div className="overview-divider" />
        <div className="overview-item"><span className="overview-icon lavender"><Check size={17} /></span><span><strong>{readyCount}</strong><small>Ready to study</small></span></div>
        <div className="overview-divider" />
        <div className="overview-item"><span className="overview-icon peach"><FileText size={17} /></span><span><strong>{pageCount}</strong><small>Pages processed</small></span></div>
        <div className="overview-note"><ShieldCheck size={15} /> Private to your account</div>
      </div>

      {(notice || error) && <div className={`notice ${error ? 'notice-error' : 'notice-success'}`} role={error ? 'alert' : 'status'}>
        {error ? <span>{error}</span> : <><Check size={16} /><span>{notice}</span></>}
        <button className="icon-button" onClick={() => { setError(''); setNotice(''); }} aria-label="Dismiss message"><X size={16} /></button>
      </div>}

      <div className="library-columns">
        <section className="library-section" aria-labelledby="library-heading">
          <div className="section-title-row">
            <div><span className="section-eyebrow">YOUR COLLECTION</span><h2 id="library-heading">PDF library <span className="count-pill">{documents.length}</span></h2></div>
            <button className="text-button" onClick={() => fileInput.current?.click()}><Plus size={16} /> Add PDF</button>
          </div>

          <div
            className={`upload-card ${dragging ? 'upload-card-dragging' : ''} ${uploadProgress !== null ? 'upload-card-uploading' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={onDrop}
          >
            <input
              ref={fileInput}
              className="visually-hidden"
              type="file"
              accept="application/pdf,.pdf"
              aria-label="Choose a PDF to upload"
              onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFile(event.target.files?.[0])}
            />
            <div className="upload-icon"><UploadCloud size={22} aria-hidden="true" /></div>
            <div className="upload-copy"><strong>{uploadProgress === null ? 'Drop a PDF to get started' : `Uploading your PDF · ${uploadProgress}%`}</strong><span>or choose a file from your device <i>·</i> up to {maxUploadMb} MB</span></div>
            <button className="button button-light" disabled={uploadProgress !== null} onClick={() => fileInput.current?.click()}>
              {uploadProgress === null ? 'Choose PDF' : <LoaderCircle className="spin" size={16} />}
            </button>
            {uploadProgress !== null && <div className="upload-progress" style={{ width: `${uploadProgress}%` }} />}
          </div>

          {loading && documents.length === 0 ? <div className="skeleton-stack" aria-label="Loading documents"><div /><div /><div /></div> : documents.length === 0 ? (
            <div className="empty-library"><div className="empty-library-icon"><FileText size={22} /></div><h3>Your library is ready for its first PDF.</h3><p>Upload notes, a textbook chapter, or a research paper to start asking grounded questions.</p><button className="text-button" onClick={() => fileInput.current?.click()}>Upload your first PDF <ArrowRight size={15} /></button></div>
          ) : (
            <div className="document-list">
              {documents.map((document) => (
                <article className="document-card" key={document.id}>
                  <div className={`document-icon ${document.status === 'failed' ? 'document-icon-warn' : ''}`}><FileText size={20} aria-hidden="true" /></div>
                  <div className="document-main">
                    <div className="document-title-row"><h3 title={document.filename}>{document.filename}</h3><StatusBadge status={document.status} /></div>
                    <div className="document-meta"><span>{formatBytes(document.sizeBytes)}</span><span className="meta-dot">·</span><span>{document.pageCount ? `${document.pageCount} pages` : 'PDF document'}</span><span className="meta-dot">·</span><span>Added {formatDate(document.createdAt)}</span></div>
                    {document.error && <p className="document-error">{document.error}</p>}
                    {(document.status === 'queued' || document.status === 'processing') && <div className="processing-track"><span className="processing-shimmer" /></div>}
                  </div>
                  <div className="document-actions">
                    {document.status === 'ready' && <button className="icon-button" onClick={() => setPreview(document)} title="Preview PDF" aria-label={`Preview ${document.filename}`}><BookOpen size={17} /></button>}
                    {document.status === 'ready' && <button className="study-link" onClick={() => navigate(`/study?documentId=${encodeURIComponent(document.id)}`)}>Study <ArrowRight size={15} /></button>}
                    {document.status === 'failed' && <button className="icon-button" disabled={busyId === document.id} onClick={() => void retry(document)} title="Retry processing" aria-label={`Retry ${document.filename}`}><RefreshCw className={busyId === document.id ? 'spin' : ''} size={16} /></button>}
                    <button className="icon-button subtle-action" disabled={busyId === document.id} onClick={() => void remove(document)} title="Remove PDF" aria-label={`Remove ${document.filename}`}><Trash2 size={16} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="recent-panel" aria-labelledby="recent-heading">
          <div className="section-title-row recent-title-row"><div><span className="section-eyebrow">PICK UP THE THREAD</span><h2 id="recent-heading">Recent chats</h2></div><button className="icon-button" onClick={() => navigate('/history')} aria-label="See all conversations"><MoreHorizontal size={20} /></button></div>
          {conversations.length === 0 ? (
            <div className="recent-empty"><span><MessageSquareText size={18} /></span><p>Your study conversations will show up here.</p><button className="text-button" onClick={() => navigate('/study')}>Start a chat <ArrowRight size={14} /></button></div>
          ) : (
            <div className="recent-list">
              {conversations.map((conversation) => (
                <button key={conversation.id} className="recent-chat" onClick={() => navigate(`/study/${conversation.id}`)}>
                  <span className="recent-chat-icon"><MessageSquareText size={16} /></span>
                  <span className="recent-chat-content"><strong>{conversation.title}</strong><small><Clock3 size={12} /> {formatDate(conversation.updatedAt)}</small></span>
                  <ArrowRight className="recent-arrow" size={15} />
                </button>
              ))}
              <button className="recent-all" onClick={() => navigate('/history')}>View all chats <ArrowRight size={14} /></button>
            </div>
          )}
          <div className="privacy-card"><span className="privacy-icon"><ShieldCheck size={17} /></span><div><strong>Your sources stay yours.</strong><p>Documents and conversations are kept within your account.</p></div></div>
        </aside>
      </div>

      {preview && <div className="reader-backdrop" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
        <section className="reader-modal" role="dialog" aria-modal="true" aria-labelledby="reader-title">
          <header className="reader-modal-head"><div><span className="section-eyebrow">PDF PREVIEW</span><h2 id="reader-title">{preview.filename}</h2></div><button className="icon-button" onClick={() => setPreview(null)} aria-label="Close preview"><X size={19} /></button></header>
          <iframe title={`PDF preview: ${preview.filename}`} src={`/api/documents/${encodeURIComponent(preview.id)}/file#page=1`} />
        </section>
      </div>}
    </div>
  );
}

function SparkleMark() {
  return <span className="sparkle-mark" aria-hidden="true">✦</span>;
}
