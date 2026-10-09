import { useState, type FormEvent } from 'react';
import { ArrowRight, BookOpenCheck, Check, FileText, LockKeyhole, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiRequestError } from '../lib/api';
import { Brand } from '../components/Brand';

export function AuthPage() {
  const { signIn, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (isRegister) await register(email.trim(), password);
      else await signIn(email.trim(), password);
      const target = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(target && target !== '/login' ? target : '/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : 'We could not reach the study space. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="About Pagewise">
        <div className="auth-story-inner">
          <Brand />
          <div className="story-copy">
            <span className="eyebrow-light"><Sparkles size={14} aria-hidden="true" /> YOUR PDF, A BETTER STUDY SESSION</span>
            <h1>Make every<br />page <span>click.</span></h1>
            <p>Bring your reading together, ask focused questions, and keep the evidence one tap away.</p>
          </div>
          <div className="story-preview" aria-hidden="true">
            <div className="story-preview-top"><span className="story-mini-icon"><FileText size={16} /></span><span>Lecture-notes.pdf</span><span className="story-ready"><Check size={12} /> Ready</span></div>
            <div className="story-preview-question">What are the three stages of cellular respiration?</div>
            <div className="story-preview-answer">The document describes glycolysis, the citric acid cycle, and oxidative phosphorylation…</div>
            <div className="story-preview-cite"><BookOpenCheck size={13} /> Lecture-notes.pdf <span>p. 08</span></div>
          </div>
          <div className="story-footnote"><LockKeyhole size={14} aria-hidden="true" /> Your documents stay scoped to your account.</div>
        </div>
        <div className="auth-orb auth-orb-one" aria-hidden="true" />
        <div className="auth-orb auth-orb-two" aria-hidden="true" />
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <span className="auth-step">{isRegister ? 'CREATE YOUR SPACE' : 'WELCOME BACK'}</span>
            <h2 id="auth-title">{isRegister ? 'Start your study space.' : 'Pick up where you left off.'}</h2>
            <p>{isRegister ? 'Create an account to keep your documents and chats together.' : 'Sign in to get back to your library and conversations.'}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              maxLength={254}
              required
            />
            <div className="password-label-row"><label htmlFor="password">Password</label>{isRegister && <span>12 characters minimum</span>}</div>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isRegister ? 'Choose a strong passphrase' : 'Enter your password'}
              minLength={isRegister ? 12 : 1}
              maxLength={128}
              required
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-dark auth-submit" type="submit" disabled={busy}>
              <span>{busy ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}</span>
              {!busy && <ArrowRight size={17} aria-hidden="true" />}
            </button>
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to Pagewise?'}{' '}
            <button type="button" onClick={() => { setIsRegister((value) => !value); setError(''); }}>
              {isRegister ? 'Sign in' : 'Create an account'}
            </button>
          </p>
          <p className="auth-terms">By continuing, you agree to use only documents you have permission to study.</p>
        </div>
        <footer className="auth-footer"><span>PAGEWISE © 2026</span><span>Made for curious minds</span></footer>
      </section>
    </main>
  );
}
