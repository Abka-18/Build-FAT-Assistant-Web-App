import { useState, useRef } from 'react';
import { Upload, Send, CheckCircle2, FileText } from 'lucide-react';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
}

export default function App() {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const handleFileUpload = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB');
      return;
    }
    if (!file.name.endsWith('.txt') && !file.name.endsWith('.pdf')) {
      alert('Only .txt and .pdf files are supported');
      return;
    }
    setUploadedFile(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setKnowledgeBase(text);
    };
    reader.readAsText(file);
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

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputValue,
      sender: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      const response = generateResponse(inputValue, knowledgeBase);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response,
        sender: 'assistant',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, 1500);
  };

  const generateResponse = (question: string, kb: string): string => {
    if (!kb) {
      return "I don't have any knowledge base loaded yet. Please upload a document or paste some information in the Knowledge Base panel so I can help you better.";
    }

    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.includes('expense') || lowerQuestion.includes('reimbursement')) {
      return "Based on the uploaded knowledge base: Expense reimbursements are submitted via the internal portal by the 5th of each month. Attach original receipts and fill out Form EXP-03. Approval is handled by the direct manager within 3 working days.";
    }

    if (lowerQuestion.includes('contact') || lowerQuestion.includes('who')) {
      return "Based on the uploaded knowledge base: For FAT-related queries, you can reach out to the Finance Manager (ext. 4521) or the Accounting Lead (ext. 4522). For tax matters, contact the Tax Specialist at tax@company.com.";
    }

    if (lowerQuestion.includes('process') || lowerQuestion.includes('workflow') || lowerQuestion.includes('how')) {
      return "Based on the uploaded knowledge base: Most FAT processes follow a standard workflow: 1) Request submission, 2) Manager approval, 3) Finance review, 4) Final processing. Specific timelines vary by request type but typically take 3-5 business days.";
    }

    return `Based on the uploaded knowledge base: I found relevant information about "${question}". The knowledge base contains procedures and contacts that can help answer your question. For specific details, please refer to the uploaded documentation or ask more specifically about processes, contacts, or workflows.`;
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
              accept=".txt,.pdf"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
              className="hidden"
            />
            <div className="flex flex-col items-center gap-2 text-center">
              <Upload size={32} style={{ color: '#64748B' }} />
              <p style={{ color: '#0F172A' }}>
                Drag & drop or click to upload
              </p>
              <p className="text-sm" style={{ color: '#64748B' }}>
                .txt or .pdf file
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