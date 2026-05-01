import { useState, useRef } from 'react';
import { Upload, Send, CheckCircle2, FileText } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

const supportedExtensions = ['txt', 'pdf', 'docx', 'xls', 'xlsx', 'csv'];

export default function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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
      setKnowledgeBase(prev => prev + '\n\n' + manualText);
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
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
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
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (error) {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: error instanceof Error ? error.message : 'Tidak bisa menghubungi AI server. Pastikan npm run dev masih berjalan dan HF_TOKEN sudah diisi.',
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
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
    <div className="size-full flex" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Left Panel - Memory/Knowledge Base */}
      <div className="w-[30%] bg-white border-r flex flex-col" style={{ borderColor: '#E2E8F0' }}>
        <div className="p-4 border-b" style={{ borderColor: '#E2E8F0' }}>
          <h2 className="flex items-center gap-2" style={{ color: '#0F172A' }}>
            📁 Knowledge Base
          </h2>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            Upload file to teach the assistant
          </p>
        </div>

        <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
          {/* Upload Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-gray-50 transition-colors"
            style={{ borderColor: '#E2E8F0' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.pdf,.docx,.xls,.xlsx,.csv"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload size={32} style={{ color: '#64748B' }} />
              <p style={{ color: '#0F172A' }}>
                Drag & drop or click to upload
              </p>
              <p className="text-sm" style={{ color: '#64748B' }}>
                .txt, .pdf, .docx, .xls, .xlsx, or .csv
              </p>
              <p className="text-xs" style={{ color: '#64748B' }}>
                Max 2MB
              </p>
            </div>
          </div>

          {/* Uploaded File Display */}
          {uploadedFile && (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ backgroundColor: '#F1F5F9' }}>
              <CheckCircle2 size={20} style={{ color: '#10B981' }} />
              <FileText size={18} style={{ color: '#64748B' }} />
              <span className="text-sm flex-1" style={{ color: '#0F172A' }}>
                {uploadedFile.name}
              </span>
            </div>
          )}

          {/* Manual Text Input */}
          <div className="flex flex-col gap-2">
            <label style={{ color: '#0F172A' }}>Or paste text directly</label>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Paste SOPs, FAQs, workflows, contacts here..."
              className="w-full h-32 p-3 border rounded-lg resize-none"
              style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
            />
          </div>

          {/* Save Button */}
          <button
            onClick={handleSaveMemory}
            className="w-full py-3 rounded-lg transition-colors"
            style={{ backgroundColor: '#2563EB', color: 'white' }}
          >
            Save Memory
          </button>
        </div>
      </div>

      {/* Right Panel - Chat */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="p-4 border-b flex items-center gap-3" style={{ borderColor: '#E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#2563EB', color: 'white' }}>
            FA
          </div>
          <div className="flex-1">
            <h3 style={{ color: '#0F172A' }}>FAT Assistant</h3>
            <p className="text-sm flex items-center gap-2" style={{ color: '#64748B' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#10B981' }}></span>
              Powered by AI · Based on uploaded knowledge
            </p>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
              <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F1F5F9' }}>
                <FileText size={48} style={{ color: '#64748B' }} />
              </div>
              <p style={{ color: '#0F172A' }}>Ask me anything about FAT workflows, SOPs, or contacts.</p>
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
                      backgroundColor: msg.sender === 'user' ? '#2563EB' : '#F1F5F9',
                      color: msg.sender === 'user' ? 'white' : '#0F172A'
                    }}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-xl" style={{ backgroundColor: '#F1F5F9' }}>
                    <div className="flex gap-1">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#64748B', animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#64748B', animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: '#64748B', animationDelay: '300ms' }}></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 border-t" style={{ borderColor: '#E2E8F0' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask a question..."
              className="flex-1 px-4 py-3 border rounded-lg"
              style={{ borderColor: '#E2E8F0', color: '#0F172A' }}
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-3 rounded-lg transition-colors"
              style={{ backgroundColor: '#2563EB', color: 'white' }}
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
