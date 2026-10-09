import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock3, FileText, MessageSquareText, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, ApiRequestError, type Conversation } from '../lib/api';

function displayDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

export function HistoryPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const result = await api.conversations();
      setConversations(result.conversations);
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'Your conversations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  function beginRename(conversation: Conversation) {
    setEditingId(conversation.id);
    setTitleDraft(conversation.title);
  }

  async function saveRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId || !titleDraft.trim()) return;
    setSaving(true);
    try {
      const result = await api.renameConversation(editingId, titleDraft.trim());
      setConversations((current) => current.map((item) => item.id === editingId ? result.conversation : item));
      setEditingId(null);
      setError('');
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'The title could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(conversation: Conversation) {
    if (!window.confirm(`Delete “${conversation.title}” and its messages?`)) return;
    try {
      await api.deleteConversation(conversation.id);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'The conversation could not be deleted.');
    }
  }

  return (
    <div className="history-page">
      <section className="history-intro">
        <div><span className="section-eyebrow"><span className="eyebrow-line" /> YOUR STUDY TRAIL</span><h2>Pick up the thread.</h2><p>Every question and source citation, right where you left it.</p></div>
        <button className="button button-dark" onClick={() => navigate('/study')}><Plus size={17} /> New study chat</button>
      </section>

      {error && <div className="notice notice-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error"><X size={15} /></button></div>}

      <section className="history-card" aria-labelledby="history-list-heading">
        <div className="history-card-head"><div><span className="section-eyebrow">CONVERSATIONS</span><h3 id="history-list-heading">Recent study chats <span className="count-pill">{conversations.length}</span></h3></div><span className="history-sort"><Clock3 size={14} /> Recently active</span></div>
        {loading ? <div className="history-loading"><span /><span /><span /></div> : conversations.length === 0 ? (
          <div className="history-empty"><span className="history-empty-icon"><MessageSquareText size={21} /></span><h3>No conversations yet.</h3><p>Start a study chat from one of your ready PDFs, and it will be saved here.</p><button className="text-button" onClick={() => navigate('/')}>View your library <ArrowRight size={15} /></button></div>
        ) : (
          <div className="history-list">
            {conversations.map((conversation) => (
              <article className="history-item" key={conversation.id}>
                {editingId === conversation.id ? (
                  <form className="rename-form" onSubmit={(event) => void saveRename(event)}>
                    <label className="visually-hidden" htmlFor={`rename-${conversation.id}`}>Conversation title</label>
                    <input id={`rename-${conversation.id}`} value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} maxLength={100} autoFocus />
                    <button className="button button-primary compact-button" type="submit" disabled={saving || !titleDraft.trim()}>{saving ? 'Saving…' : 'Save'}</button>
                    <button className="icon-button" type="button" onClick={() => setEditingId(null)} aria-label="Cancel rename"><X size={16} /></button>
                  </form>
                ) : (
                  <>
                    <button className="history-open" onClick={() => navigate(`/study/${conversation.id}`)}>
                      <span className="history-chat-icon"><MessageSquareText size={18} /></span>
                      <span className="history-item-main"><strong>{conversation.title}</strong><span className="history-item-meta"><span><CalendarDays size={13} /> {displayDate(conversation.updatedAt)}</span><i>·</i><span><FileText size={13} /> {conversation.documentIds.length} source{conversation.documentIds.length === 1 ? '' : 's'}</span></span></span>
                      <ArrowRight className="history-open-arrow" size={17} />
                    </button>
                    <div className="history-actions">
                      <button className="icon-button" onClick={() => beginRename(conversation)} aria-label={`Rename ${conversation.title}`} title="Rename"><Pencil size={15} /></button>
                      <button className="icon-button history-delete" onClick={() => void remove(conversation)} aria-label={`Delete ${conversation.title}`} title="Delete"><Trash2 size={15} /></button>
                    </div>
                  </>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="history-note"><span className="note-icon"><MoreHorizontal size={17} /></span><p>Conversations are private to your account. Deleting a conversation removes its message history.</p></div>
    </div>
  );
}
