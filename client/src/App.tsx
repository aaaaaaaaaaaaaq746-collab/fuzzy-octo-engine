import { useMemo } from 'react';
import { BookOpen, Clock3, LogOut, MessageSquareText, Plus, Sparkles } from 'lucide-react';
import { NavLink, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Brand } from './components/Brand';
import { AuthPage } from './pages/AuthPage';
import { HistoryPage } from './pages/HistoryPage';
import { LibraryPage } from './pages/LibraryPage';
import { StudyPage } from './pages/StudyPage';

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <Brand />
      <span className="loading-pulse" aria-label="Loading your study space" />
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : <AuthPage />;
}

function DashboardLayout() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/study')) return 'Study room';
    if (location.pathname.startsWith('/history')) return 'Your study history';
    return 'Your library';
  }, [location.pathname]);

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // The local session is cleared even if the server is temporarily unreachable.
    }
    navigate('/login', { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <NavLink className="sidebar-brand" to="/" aria-label="Pagewise home"><Brand /></NavLink>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="primary-nav">
          <NavLink end to="/" aria-label="Library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <BookOpen size={18} aria-hidden="true" /><span>Library</span>
          </NavLink>
          <NavLink to="/study" aria-label="Study room" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquareText size={18} aria-hidden="true" /><span>Study room</span>
          </NavLink>
          <NavLink to="/history" aria-label="Chat history" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Clock3 size={18} aria-hidden="true" /><span>Chat history</span>
          </NavLink>
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-tip">
          <span className="tip-icon"><Sparkles size={16} aria-hidden="true" /></span>
          <p>Good questions start with a source.</p>
          <span>Keep your best PDFs close.</span>
        </div>
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">{user?.email.slice(0, 1).toUpperCase()}</span>
          <span className="account-email" title={user?.email}>{user?.email}</span>
          <button className="icon-button signout-button" onClick={handleSignOut} aria-label="Sign out" title="Sign out">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-title"><span className="topbar-kicker">PAGEWISE / STUDY SPACE</span><h1>{pageTitle}</h1></div>
          <NavLink className="button button-primary topbar-action" to="/study">
            <Plus size={17} aria-hidden="true" /><span>New study chat</span>
          </NavLink>
        </header>
        <main className="page-content"><Outlet /></main>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly />} />
      <Route element={<RequireAuth />}>
        <Route element={<DashboardLayout />}>
          <Route index element={<LibraryPage />} />
          <Route path="study" element={<StudyPage />} />
          <Route path="study/:conversationId" element={<StudyPage />} />
          <Route path="history" element={<HistoryPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
