import { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { FileText, Folder, LogOut, Moon, Send, Sun, Trash2, Upload } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '../lib/supabase';
import LoginPage from './LoginPage';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

interface KBDocument {
  id: string;
  title: string;
  content: string;
  sourceType: 'upload' | 'manual';
}

type ThemeMode = 'light' | 'dark';

const supportedExtensions = ['txt', 'pdf', 'docx', 'xls', 'xlsx', 'csv'];

const themeTokens = {
  light: {
    app: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceMuted: '#F1F5F9',
    surfaceHover: '#F8FAFC',
    border: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#64748B',
    primary: '#2563EB',
    danger: '#EF4444',
    shadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
    input: '#FFFFFF',
  },
  dark: {
    app: '#0B1120',
    surface: '#111827',
    surfaceMuted: '#1E293B',
    surfaceHover: '#172033',
    border: '#334155',
    text: '#E5E7EB',
    textMuted: '#94A3B8',
    primary: '#3B82F6',
    danger: '#F87171',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
    input: '#0F172A',
  },
};

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('fat-assistant-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [manualText, setManualText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);
  const [mobileTab, setMobileTab] = useState<'kb' | 'chat'>('chat');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeDocTitles, setActiveDocTitles] = useState<Set<string>>(new Set());
  const [newPassword, setNewPassword] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const theme = themeTokens[themeMode];

  const apiBase = (import.meta.env.VITE_API_URL as string) || '';

  useEffect(() => {
    localStorage.setItem('fat-assistant-theme', themeMode);
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setAuthSession(session);
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (authSession) fetchDocuments();
  }, [authSession]);

  const fetchDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const res = await fetch(`${apiBase}/api/documents`);
      if (res.ok) {
        const payload = await res.json();
        setDocuments(
          payload.documents.map((d: { id: string; title: string; content: string; source_type: string }) => ({
            id: d.id,
            title: d.title,
            content: d.content,
            sourceType: d.source_type as 'upload' | 'manual',
          })),
        );
      }
    } catch {
      // Supabase not configured — local-only mode, start empty
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const toggleTheme = () => setThemeMode((t) => (t === 'light' ? 'dark' : 'light'));

  const handleLogout = () => supabase.auth.signOut();

  const handleFileUpload = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      return;
    }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !supportedExtensions.includes(extension)) {
      alert('Only .txt, .pdf, .docx, .xls, .xlsx, and .csv files are supported');
      return;
    }
    try {
      const content = await extractTextFromFile(file, extension);
      if (!content.trim()) {
        if (extension === 'pdf') {
          alert(
            'PDF ini tidak bisa dibaca — kemungkinan PDF scan (berisi gambar, bukan teks).\n\n' +
            'Solusi:\n' +
            '1. Buka di Google Docs → File → Download → .docx → upload .docx-nya\n' +
            '2. Gunakan layanan OCR online (smallpdf.com, ilovepdf.com)\n' +
            '3. Copy-paste teks manual ke kolom "Or paste text directly"'
          );
        } else {
          alert('No readable text was found in this file');
        }
        return;
      }
      const tempId = `temp-${Date.now()}`;
      setDocuments((prev) => [...prev, { id: tempId, title: file.name, content, sourceType: 'upload' }]);

      saveDocumentToBackend({
        title: file.name,
        content,
        sourceType: 'upload',
        metadata: { fileName: file.name, fileSize: file.size, fileType: file.type, extension },
      })
        .then((saved) => {
          if (saved?.id) {
            setDocuments((prev) => prev.map((d) => (d.id === tempId ? { ...d, id: saved.id } : d)));
          }
        })
        .catch((err) => console.warn('Failed to save to Supabase:', err));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to read this file');
    }
  };

  const extractTextFromFile = async (file: File, extension: string): Promise<string> => {
    if (extension === 'txt' || extension === 'csv') {
      return file.text();
    }
    const buffer = await file.arrayBuffer();
    if (extension === 'pdf') {
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ');
        pages.push(text);
      }
      return pages.join('\n\n');
    }
    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return result.value;
    }
    if (extension === 'xls' || extension === 'xlsx') {
      const workbook = XLSX.read(buffer, { type: 'array' });
      return workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        return `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(worksheet)}`;
      }).join('\n\n');
    }
    throw new Error('Unsupported file type');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleSaveMemory = () => {
    const text = manualText.trim();
    if (!text) return;
    const title = `Manual memory ${new Date().toLocaleString()}`;
    const tempId = `temp-${Date.now()}`;
    setDocuments((prev) => [...prev, { id: tempId, title, content: text, sourceType: 'manual' }]);
    setManualText('');
    alert('Knowledge base updated!');
    saveDocumentToBackend({ title, content: text, sourceType: 'manual', metadata: { createdFrom: 'manual-textarea' } })
      .then((saved) => {
        if (saved?.id) {
          setDocuments((prev) => prev.map((d) => (d.id === tempId ? { ...d, id: saved.id } : d)));
        }
      })
      .catch((err) => console.warn('Failed to save manual memory to Supabase:', err));
  };

  const saveDocumentToBackend = async (doc: {
    title: string;
    content: string;
    sourceType: 'upload' | 'manual';
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string } | null> => {
    const MAX_CONTENT = 500_000;
    const body = {
      ...doc,
      content: doc.content.length > MAX_CONTENT
        ? doc.content.slice(0, MAX_CONTENT) + '\n[Content truncated — full text available in session only]'
        : doc.content,
    };
    const response = await fetch(`${apiBase}/api/documents`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.status === 503) return null;
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error =
        typeof payload === 'object' && payload && 'error' in payload
          ? String((payload as { error?: unknown }).error)
          : 'Failed to save document.';
      throw new Error(error);
    }
    const payload = await response.json();
    return payload.document;
  };

  const [reindexing, setReindexing] = useState(false);

  const handleReindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch(`${apiBase}/api/reindex`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(`Re-indexing ${data.count} dokumen di background. Tunggu ~30 detik lalu coba tanya lagi.`);
      } else {
        alert(data.error || 'Re-index gagal.');
      }
    } catch {
      alert('Tidak bisa menghubungi server.');
    } finally {
      setReindexing(false);
    }
  };

  const handleDeleteDocument = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
    if (!id.startsWith('temp-')) {
      fetch(`${apiBase}/api/documents/${id}`, { method: 'DELETE' }).catch(() => {});
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const question = inputValue;
    const userMessage: Message = { id: Date.now().toString(), text: question, sender: 'user', timestamp: new Date() };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);
    try {
      const response = await fetch(`${apiBase}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, question }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiErrorMessage(response.status, payload));
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: payload.answer || 'The model did not return an answer.',
        sender: 'assistant',
        timestamp: new Date(),
      };
      if (payload.sessionId) setSessionId(payload.sessionId);
      if (Array.isArray(payload.sources)) setActiveDocTitles(new Set(payload.sources));
      setMessages((prev) => [...prev, assistantMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text:
            error instanceof Error
              ? error.message
              : 'Tidak bisa menghubungi AI server. Pastikan npm run dev masih berjalan dan HF_TOKEN sudah diisi.',
          sender: 'assistant',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const getApiErrorMessage = (status: number, payload: unknown): string => {
    const error =
      typeof payload === 'object' && payload && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : '';
    if (error) return error;
    if (status === 404) return 'Endpoint /api/chat tidak ditemukan. Jalankan ulang dengan npm run dev dari versi terbaru.';
    if (status === 502) return 'AI server gagal menghubungi Hugging Face. Cek koneksi internet, token, atau akses model.';
    return `AI request failed dengan status ${status}.`;
  };

  if (authLoading) {
    return (
      <div className="size-full flex items-center justify-center" style={{ backgroundColor: theme.app }}>
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: theme.border, borderTopColor: theme.primary }}
        />
      </div>
    );
  }

  if (!authSession) {
    return <LoginPage theme={theme} themeMode={themeMode} onToggleTheme={toggleTheme} />;
  }

  if (isRecovery) {
    const handleSetPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      setRecoveryError('');
      setRecoveryLoading(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      setRecoveryLoading(false);
      if (error) {
        setRecoveryError(error.message);
      } else {
        setIsRecovery(false);
        setNewPassword('');
      }
    };

    return (
      <div className="size-full flex items-center justify-center" style={{ backgroundColor: theme.app }}>
        <div
          className="w-full max-w-sm mx-4 p-8 rounded-2xl"
          style={{ backgroundColor: theme.surface, boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
        >
          <div className="flex flex-col items-center gap-2 mb-8">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: theme.primary }}
            >
              FA
            </div>
            <h1 className="text-xl font-semibold" style={{ color: theme.text }}>Set New Password</h1>
            <p className="text-sm" style={{ color: theme.textMuted }}>Enter your new password below</p>
          </div>
          <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium" style={{ color: theme.text }}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="px-4 py-3 border rounded-lg text-sm outline-none"
                style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
              />
            </div>
            {recoveryError && (
              <p className="text-sm text-center" style={{ color: theme.danger }}>{recoveryError}</p>
            )}
            <button
              type="submit"
              disabled={recoveryLoading}
              className="w-full py-3 rounded-lg font-medium text-sm"
              style={{ backgroundColor: theme.primary, color: 'white', opacity: recoveryLoading ? 0.7 : 1 }}
            >
              {recoveryLoading ? 'Saving...' : 'Set New Password'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full flex flex-col transition-colors duration-200" style={{ backgroundColor: theme.app }}>

      {/* Mobile tab bar */}
      <div
        className="flex md:hidden border-b shrink-0"
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <button
          className="flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          style={{
            color: mobileTab === 'chat' ? theme.primary : theme.textMuted,
            borderBottom: mobileTab === 'chat' ? `2px solid ${theme.primary}` : '2px solid transparent',
          }}
          onClick={() => setMobileTab('chat')}
        >
          <Send size={15} /> Chat
        </button>
        <button
          className="flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          style={{
            color: mobileTab === 'kb' ? theme.primary : theme.textMuted,
            borderBottom: mobileTab === 'kb' ? `2px solid ${theme.primary}` : '2px solid transparent',
          }}
          onClick={() => setMobileTab('kb')}
        >
          <Folder size={15} /> Knowledge Base
          {documents.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.primary, color: 'white' }}>
              {documents.length}
            </span>
          )}
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-row overflow-hidden">

      {/* Left panel — Knowledge Base */}
      <div
        className={`${mobileTab === 'kb' ? 'flex' : 'hidden'} md:flex w-full md:w-[30%] border-r flex-col transition-colors duration-200`}
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      >
        <div className="p-4 border-b hidden md:block" style={{ borderColor: theme.border }}>
          <h2 className="flex items-center gap-2" style={{ color: theme.text }}>
            <Folder size={20} style={{ color: theme.primary }} />
            Knowledge Base
          </h2>
          <p className="text-sm mt-1" style={{ color: theme.textMuted }}>
            Upload file to teach the assistant
          </p>
        </div>

        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.surfaceHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = themeMode === 'dark' ? theme.input : 'transparent'; }}
            className="border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors"
            style={{ borderColor: theme.border, backgroundColor: themeMode === 'dark' ? theme.input : 'transparent' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx,.xls,.xlsx,.csv"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload size={32} style={{ color: theme.textMuted }} />
              <p style={{ color: theme.text }}>Tap or click to upload</p>
              <p className="text-sm" style={{ color: theme.textMuted }}>.txt, .pdf, .docx, .xls, .xlsx, .csv</p>
              <p className="text-xs" style={{ color: theme.textMuted }}>Max 10MB</p>
            </div>
          </div>

          {/* Document list */}
          {isLoadingDocs ? (
            <div className="flex items-center justify-center py-2">
              <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: theme.border, borderTopColor: theme.primary }} />
            </div>
          ) : documents.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium uppercase tracking-wide" style={{ color: theme.textMuted }}>
                {documents.length} document{documents.length !== 1 ? 's' : ''} loaded
              </p>
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 rounded-lg group" style={{ backgroundColor: theme.surfaceMuted }}>
                  <FileText size={15} style={{ color: theme.textMuted, flexShrink: 0 }} />
                  {activeDocTitles.has(doc.title) && (
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: '#10B981' }}
                      title="Used in last response"
                    />
                  )}
                  <span className="text-sm flex-1 truncate" style={{ color: theme.text }} title={doc.title}>{doc.title}</span>
                  {pendingDeleteId === doc.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs font-medium" style={{ color: theme.danger }}>Hapus?</span>
                      <button
                        onClick={() => { handleDeleteDocument(doc.id); setPendingDeleteId(null); }}
                        className="text-xs px-2 py-0.5 rounded font-medium"
                        style={{ backgroundColor: theme.danger, color: 'white' }}
                      >
                        Ya
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="text-xs px-2 py-0.5 rounded font-medium border"
                        style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                      >
                        Tidak
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPendingDeleteId(doc.id)}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1 rounded"
                      style={{ color: theme.danger }}
                      title="Hapus dari knowledge base"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {/* Re-index button */}
          {documents.length > 0 && (
            <button
              onClick={handleReindex}
              disabled={reindexing}
              className="text-xs px-3 py-1.5 rounded-lg border w-full transition-opacity"
              style={{ borderColor: theme.border, color: theme.textMuted, opacity: reindexing ? 0.5 : 1 }}
            >
              {reindexing ? 'Re-indexing…' : '↻ Re-index dokumen (jika AI tidak bisa baca file)'}
            </button>
          )}

          {/* Manual text */}
          <div className="flex flex-col gap-2">
            <label className="text-sm" style={{ color: theme.text }}>Or paste text directly</label>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste SOPs, FAQs, workflows, contacts here..."
              className="w-full h-32 p-3 border rounded-lg resize-none text-sm"
              style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
            />
          </div>

          <button
            onClick={handleSaveMemory}
            className="w-full py-3 rounded-lg transition-colors font-medium"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            Save Memory
          </button>
        </div>
      </div>

      {/* Right panel — Chat */}
      <div
        className={`${mobileTab === 'chat' ? 'flex' : 'hidden'} md:flex flex-1 flex-col transition-colors duration-200`}
        style={{ backgroundColor: theme.surface }}
      >
        <div className="p-3 md:p-4 border-b flex items-center gap-2 md:gap-3" style={{ borderColor: theme.border, boxShadow: theme.shadow }}>
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: theme.primary, color: 'white' }}>
            FA
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm md:text-base font-semibold" style={{ color: theme.text }}>FAT Assistant</h3>
            <p className="text-xs flex items-center gap-1.5 truncate" style={{ color: theme.textMuted }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: documents.length > 0 ? '#10B981' : theme.textMuted }} />
              {documents.length > 0 ? `${documents.length} doc${documents.length !== 1 ? 's' : ''} loaded` : 'No knowledge base'}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            className="w-9 h-9 md:w-11 md:h-11 rounded-lg border flex items-center justify-center shrink-0"
            style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }}
          >
            {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Logout"
            className="w-11 h-11 rounded-lg border flex items-center justify-center transition-colors"
            style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.danger }}
          >
            <LogOut size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center"
                style={{ backgroundColor: theme.surfaceMuted }}
              >
                <FileText size={48} style={{ color: theme.textMuted }} />
              </div>
              <p style={{ color: theme.text }}>Ask me anything about FAT workflows, SOPs, or contacts.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="max-w-[85%] md:max-w-[70%] px-4 py-3 rounded-xl whitespace-pre-wrap"
                    style={{
                      backgroundColor: msg.sender === 'user' ? theme.primary : theme.surfaceMuted,
                      color: msg.sender === 'user' ? 'white' : theme.text,
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-xl" style={{ backgroundColor: theme.surfaceMuted }}>
                    <div className="flex gap-1">
                      <span
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: theme.textMuted, animationDelay: '0ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: theme.textMuted, animationDelay: '150ms' }}
                      />
                      <span
                        className="w-2 h-2 rounded-full animate-bounce"
                        style={{ backgroundColor: theme.textMuted, animationDelay: '300ms' }}
                      />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="p-3 md:p-4 border-t" style={{ borderColor: theme.border }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendMessage()}
              placeholder="Ask a question..."
              className="flex-1 px-4 py-3 border rounded-lg"
              style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-3 rounded-lg transition-colors"
              style={{ backgroundColor: theme.primary, color: 'white' }}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
