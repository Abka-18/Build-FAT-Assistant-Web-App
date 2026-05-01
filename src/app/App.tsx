import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileText, Folder, Moon, Send, Sun, Upload } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
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
    success: '#10B981',
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
    success: '#34D399',
    shadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
    input: '#0F172A',
  },
};

export default function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const savedTheme = localStorage.getItem('fat-assistant-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const theme = themeTokens[themeMode];

  useEffect(() => {
    localStorage.setItem('fat-assistant-theme', themeMode);
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode((currentTheme) => currentTheme === 'light' ? 'dark' : 'light');
  };

  const handleFileUpload = async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !supportedExtensions.includes(extension)) {
      alert('Only .txt, .pdf, .docx, .xls, .xlsx, and .csv files are supported');
      return;
    }

    try {
      const text = await extractTextFromFile(file, extension);
      if (!text.trim()) {
        alert('No readable text was found in this file');
        return;
      }

      setUploadedFile(file);
      setKnowledgeBase(text);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Unable to read this file');
    }
  };

  const extractTextFromFile = async (file: File, extension: string): Promise<string> => {
    if (extension === 'txt' || extension === 'csv' || extension === 'pdf') {
      return file.text();
    }

    const buffer = await file.arrayBuffer();

    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ arrayBuffer: buffer });
      return result.value;
    }

    if (extension === 'xls' || extension === 'xlsx') {
      const workbook = XLSX.read(buffer, { type: 'array' });
      return workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_csv(worksheet);
        return `Sheet: ${sheetName}\n${rows}`;
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
    if (manualText.trim()) {
      setKnowledgeBase((prev) => prev + '\n\n' + manualText);
      setManualText('');
      alert('Knowledge base updated!');
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;
    const question = inputValue;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: question,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          question,
          knowledgeBase,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getApiErrorMessage(response.status, payload));
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: payload.answer || 'The model did not return an answer.',
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: error instanceof Error ? error.message : 'Tidak bisa menghubungi AI server. Pastikan npm run dev masih berjalan dan HF_TOKEN sudah diisi.',
        sender: 'assistant',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const getApiErrorMessage = (status: number, payload: unknown): string => {
    const error = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : '';

    if (error) return error;
    if (status === 404) return 'Endpoint /api/chat tidak ditemukan. Jalankan ulang dengan npm run dev dari versi terbaru.';
    if (status === 502) return 'AI server gagal menghubungi Hugging Face. Cek koneksi internet, token, atau akses model.';
    return `AI request failed dengan status ${status}.`;
  };

  return (
    <div className="size-full flex transition-colors duration-200" style={{ backgroundColor: theme.app }}>
      <div className="w-[30%] border-r flex flex-col transition-colors duration-200" style={{ backgroundColor: theme.surface, borderColor: theme.border }}>
        <div className="p-4 border-b" style={{ borderColor: theme.border }}>
          <h2 className="flex items-center gap-2" style={{ color: theme.text }}>
            <Folder size={20} style={{ color: theme.primary }} />
            Knowledge Base
          </h2>
          <p className="text-sm mt-1" style={{ color: theme.textMuted }}>
            Upload file to teach the assistant
          </p>
        </div>

        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.surfaceHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = themeMode === 'dark' ? theme.input : 'transparent'; }}
            className="border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors"
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
              <p style={{ color: theme.text }}>
                Drag & drop or click to upload
              </p>
              <p className="text-sm" style={{ color: theme.textMuted }}>
                .txt, .pdf, .docx, .xls, .xlsx, or .csv
              </p>
              <p className="text-xs" style={{ color: theme.textMuted }}>
                Max 2MB
              </p>
            </div>
          </div>

          {uploadedFile && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: theme.surfaceMuted }}>
              <CheckCircle2 size={20} style={{ color: theme.success }} />
              <FileText size={18} style={{ color: theme.textMuted }} />
              <span className="text-sm flex-1" style={{ color: theme.text }}>
                {uploadedFile.name}
              </span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label style={{ color: theme.text }}>Or paste text directly</label>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste SOPs, FAQs, workflows, contacts here..."
              className="w-full h-32 p-3 border rounded-lg resize-none"
              style={{ backgroundColor: theme.input, borderColor: theme.border, color: theme.text }}
            />
          </div>

          <button
            onClick={handleSaveMemory}
            className="w-full py-3 rounded-lg transition-colors"
            style={{ backgroundColor: theme.primary, color: 'white' }}
          >
            Save Memory
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col transition-colors duration-200" style={{ backgroundColor: theme.surface }}>
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: theme.border, boxShadow: theme.shadow }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.primary, color: 'white' }}>
            FA
          </div>
          <div className="flex-1">
            <h3 style={{ color: theme.text }}>FAT Assistant</h3>
            <p className="text-sm flex items-center gap-2" style={{ color: theme.textMuted }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.success }} />
              Powered by AI - Based on uploaded knowledge
            </p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={themeMode === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            title={themeMode === 'light' ? 'Dark mode' : 'Light mode'}
            className="w-11 h-11 rounded-lg border flex items-center justify-center transition-colors"
            style={{ backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }}
          >
            {themeMode === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: theme.surfaceMuted }}>
                <FileText size={48} style={{ color: theme.textMuted }} />
              </div>
              <p style={{ color: theme.text }}>Ask me anything about FAT workflows, SOPs, or contacts.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className="max-w-[70%] px-4 py-3 rounded-xl"
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
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textMuted, animationDelay: '0ms' }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textMuted, animationDelay: '150ms' }} />
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: theme.textMuted, animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="p-4 border-t" style={{ borderColor: theme.border }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
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
  );
}
