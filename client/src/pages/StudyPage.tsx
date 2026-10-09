import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, BookOpenCheck, Check, ChevronDown, ChevronLeft, ChevronRight, FileText, LoaderCircle, MessageSquareText, PanelRightClose, Send, Sparkles, X } from 'lucide-react';
import { api, ApiRequestError, type Citation, type Conversation, type StudyDocument, type StudyMessage } from '../lib/api';

const suggestedQuestions = [
  'What are the key ideas in this PDF?',
  'Explain the most important terms.',
  'What should I remember from this section?',
];

export function StudyPage() {
  const { conversationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedDocumentId = searchParams.get('documentId');
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<StudyMessage[]>([]);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [readerCitation, setReaderCitation] = useState<Citation | null>(null);
  const [readerPage, setReaderPage] = useState(1);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    api.documents()
      .then(({ documents: result }) => {
        if (!active) return;
        setDocuments(result);
        if (!conversationId) {
          const preselected = requestedDocumentId && result.some((doc) => doc.id === requestedDocumentId && doc.status === 'ready')
            ? requestedDocumentId
            : result.find((doc) => doc.status === 'ready')?.id;
          setSelectedIds(preselected ? [preselected] : []);
        }
      })
      .catch((caught) => { if (active) setError(caught instanceof ApiRequestError ? caught.message : 'Your documents could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, requestedDocumentId]);

  useEffect(() => {
    let active = true;
    if (!conversationId) {
      setConversation(null);
      setMessages([]);
      setLoadingConversation(false);
      return () => { active = false; };
    }
    setLoadingConversation(true);
    setError('');
    api.conversationMessages(conversationId)
      .then((result) => {
        if (!active) return;
        setConversation(result.conversation);
        setMessages(result.messages);
        setSelectedIds(result.conversation.documentIds);
      })
      .catch((caught) => {
        if (!active) return;
        setError(caught instanceof ApiRequestError ? caught.message : 'This conversation could not be opened.');
        setConversation(null);
        setMessages([]);
      })
      .finally(() => { if (active) setLoadingConversation(false); });
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  const readyDocuments = useMemo(() => documents.filter((document) => document.status === 'ready'), [documents]);
  const selectedDocuments = useMemo(() => readyDocuments.filter((document) => selectedIds.includes(document.id)), [readyDocuments, selectedIds]);
  const readerDocument = readerCitation ? documents.find((document) => document.id === readerCitation.documentId) : undefined;

  useEffect(() => {
    if (!conversationId || conversation?.id !== conversationId || loading) return;
    const readyIds = new Set(readyDocuments.map((document) => document.id));
    setSelectedIds((current) => current.filter((id) => readyIds.has(id)));
  }, [conversationId, conversation, loading, readyDocuments]);

  function toggleDocument(id: string) {
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selected) => selected !== id)
      : current.length < 10 ? [...current, id] : current);
    setError('');
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>, overrideText?: string) {
    event?.preventDefault();
    const text = (overrideText ?? draft).trim();
    if (!text || sending) return;
    if (selectedIds.length === 0) {
      setError('Select at least one ready PDF before asking a question.');
      return;
    }

    setError('');
    setSending(true);
    setDraft('');
    try {
      const result = await api.chat({
        message: text,
        documentIds: selectedIds,
        ...(conversationId ? { conversationId } : {}),
      });
      setConversation(result.conversation);
      setMessages((current) => [...current, result.userMessage, result.assistantMessage]);
      if (!conversationId) navigate(`/study/${result.conversation.id}`, { replace: true });
    } catch (caught) {
      setDraft(text);
      setError(caught instanceof ApiRequestError ? caught.message : 'Your question could not be sent. Please try again.');
      if (conversationId) {
        void api.conversationMessages(conversationId).then((result) => setMessages(result.messages)).catch(() => undefined);
      }
    } finally {
      setSending(false);
      window.setTimeout(() => textarea.current?.focus(), 0);
    }
  }

  function handleTextareaKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(undefined);
    }
  }

  function onCitation(citation: Citation) {
    setReaderCitation(citation);
    setReaderPage(citation.pageNumber);
  }

  return (
    <div className="study-page">
      <div className="study-heading-row">
        <div className="study-heading-copy">
          <span className="section-eyebrow"><span className="eyebrow-line" /> ASK THE SOURCE</span>
          <h2>{conversation?.title || 'Study room'}</h2>
          <p>Answers are grounded in the PDFs you select. Open a citation to check the page.</p>
        </div>
        <button className="button button-light study-history-link" onClick={() => navigate('/history')}><MessageSquareText size={16} /> Chat history <ArrowRight size={14} /></button>
      </div>

      {error && <div className="notice notice-error study-notice" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

      <div className={`study-workspace ${readerCitation ? 'has-reader' : ''}`}>
        <aside className="source-panel" aria-label="Select study sources">
          <div className="source-panel-head"><div><span className="section-eyebrow">YOUR SOURCES</span><h3>Study from</h3></div><span className="source-count">{selectedIds.length}/10</span></div>
          <p className="source-help">Choose one or more ready PDFs. Answers will only use these sources.</p>
          <div className="source-list">
            {loading ? <div className="source-skeleton"><span /><span /><span /></div> : readyDocuments.length === 0 ? (
              <div className="source-empty"><span className="source-empty-icon"><BookOpen size={18} /></span><strong>No ready PDFs yet</strong><p>Upload a text-based PDF from your library to begin.</p><button className="text-button" onClick={() => navigate('/')}>Go to library <ArrowRight size={14} /></button></div>
            ) : readyDocuments.map((document) => {
              const selected = selectedIds.includes(document.id);
              return (
                <button key={document.id} className={`source-option ${selected ? 'selected' : ''}`} onClick={() => toggleDocument(document.id)} aria-pressed={selected}>
                  <span className={`source-check ${selected ? 'checked' : ''}`}>{selected && <Check size={13} aria-hidden="true" />}</span>
                  <span className="source-file-icon"><FileText size={16} aria-hidden="true" /></span>
                  <span className="source-option-copy"><strong title={document.filename}>{document.filename}</strong><small>{document.pageCount} pages · {Math.max(1, Math.round(document.sizeBytes / 1_000_000))} MB</small></span>
                </button>
              );
            })}
          </div>
          <div className="source-panel-foot"><ShieldCheckIcon /> Only your selected documents are searched.</div>
        </aside>

        <section className={`chat-panel ${readerCitation ? 'chat-panel-reader-open' : ''}`} aria-label="Study conversation">
          <div className="chat-panel-header">
            <div className="chat-context"><span className="chat-context-icon"><Sparkles size={15} /></span><span>{selectedDocuments.length ? `${selectedDocuments.length} source${selectedDocuments.length === 1 ? '' : 's'} selected` : 'Select a PDF to get started'}</span><ChevronDown size={14} className="context-chevron" /></div>
            <div className="chat-panel-actions">
              <span className="grounding-pill"><span /> Grounded answers</span>
              {readerCitation && <button className="icon-button close-reader-small" onClick={() => setReaderCitation(null)} aria-label="Close PDF preview"><PanelRightClose size={16} /></button>}
            </div>
          </div>

          <div className="chat-scroll-area">
            {loadingConversation ? <div className="chat-loading"><LoaderCircle className="spin" size={22} /><span>Opening this conversation…</span></div> : messages.length === 0 ? (
              <div className="chat-empty-state">
                <div className="chat-empty-mark"><BookOpenCheck size={24} /></div>
                <span className="section-eyebrow">A BETTER WAY THROUGH THE READING</span>
                <h3>Ask a question.<br /><span>Stay close to the page.</span></h3>
                <p>Choose a source and ask about an idea, a definition, or how two concepts fit together.</p>
                <div className="suggested-questions">
                  {suggestedQuestions.map((question) => <button key={question} onClick={() => void sendMessage(undefined, question)} disabled={selectedIds.length === 0 || sending}>{question}<ArrowRight size={14} /></button>)}
                </div>
              </div>
            ) : (
              <div className="message-list">
                {messages.map((message) => <MessageBubble key={message.id} message={message} onCitation={onCitation} />)}
                {sending && <div className="assistant-row"><span className="assistant-avatar"><Sparkles size={15} /></span><div className="typing-bubble"><span /><span /><span /><small>Checking your sources…</small></div></div>}
                <div ref={messagesEnd} />
              </div>
            )}
          </div>

          <form className="composer" onSubmit={(event) => void sendMessage(event)}>
            <label className="visually-hidden" htmlFor="study-question">Ask a question about your selected PDFs</label>
            <textarea
              id="study-question"
              ref={textarea}
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 4_000))}
              onKeyDown={handleTextareaKeyDown}
              placeholder={selectedIds.length ? 'Ask something about your selected PDF…' : 'Select a ready PDF to start asking'}
              rows={2}
              maxLength={4_000}
              disabled={selectedIds.length === 0 || sending}
            />
            <div className="composer-footer"><span>Enter to send <i>·</i> Shift + Enter for a new line <i>·</i> {draft.length}/4,000</span><button className="send-button" type="submit" disabled={!draft.trim() || selectedIds.length === 0 || sending} aria-label="Send question">{sending ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}</button></div>
          </form>
          <p className="chat-disclaimer">Answers are grounded in selected PDF excerpts. Check citations against the original page.</p>
        </section>

        {readerCitation && <aside className="study-reader" aria-label="PDF citation preview">
          <div className="study-reader-head">
            <div><span className="section-eyebrow">PDF READER</span><strong title={readerCitation.filename}>{readerCitation.filename}</strong></div>
            <div className="reader-controls">
              <button className="icon-button" disabled={readerPage <= 1} onClick={() => setReaderPage((page) => Math.max(1, page - 1))} aria-label="Previous PDF page"><ChevronLeft size={16} /></button>
              <span>Page {readerPage} / {readerDocument?.pageCount || '—'}</span>
              <button className="icon-button" disabled={!readerDocument || readerPage >= readerDocument.pageCount} onClick={() => setReaderPage((page) => Math.min(readerDocument?.pageCount ?? page, page + 1))} aria-label="Next PDF page"><ChevronRight size={16} /></button>
              <button className="icon-button reader-close" onClick={() => setReaderCitation(null)} aria-label="Close PDF preview"><X size={17} /></button>
            </div>
          </div>
          <div className="citation-quote"><span className="quote-mark">“</span><p>{readerCitation.quote}</p></div>
          <iframe title={`${readerCitation.filename}, page ${readerPage}`} src={`/api/documents/${encodeURIComponent(readerCitation.documentId)}/file#page=${readerPage}`} />
          <div className="reader-page-footer"><BookOpen size={14} /><span>Source excerpt cited from page {readerCitation.pageNumber}</span></div>
        </aside>}
      </div>
    </div>
  );
}

function MessageBubble({ message, onCitation }: { message: StudyMessage; onCitation(citation: Citation): void }) {
  if (message.role === 'user') {
    return <article className="user-message"><div className="user-message-content">{message.content}</div></article>;
  }
  return (
    <article className="assistant-row">
      <span className="assistant-avatar"><Sparkles size={15} aria-hidden="true" /></span>
      <div className="assistant-message">
        <div className="assistant-message-meta"><strong>Pagewise</strong>{message.answerMode === 'extractive' ? <span className="mode-label">EXTRACTIVE</span> : message.answerMode === 'generated' ? <span className="mode-label mode-generated">AI RESPONSE</span> : <span className="mode-label">SOURCE CHECK</span>}</div>
        <p className="assistant-message-text">{message.content}</p>
        {message.citations.length > 0 && <div className="citation-list" aria-label="Answer citations">
          {message.citations.map((citation, index) => <button className="citation-chip" key={`${citation.documentId}-${citation.pageNumber}-${index}`} onClick={() => onCitation(citation)}>
            <span className="citation-number">{index + 1}</span><span className="citation-name">{citation.filename}</span><span className="citation-page">p. {citation.pageNumber}</span><ArrowRight size={13} />
          </button>)}
        </div>}
        <time className="message-time" dateTime={message.createdAt}>{new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(message.createdAt))}</time>
      </div>
    </article>
  );
}

function ShieldCheckIcon() {
  return <span className="source-shield" aria-hidden="true"><BookOpenCheck size={13} /></span>;
}
