import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Send } from 'lucide-react';

interface TerminalProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  history: { role: 'user' | 'system', text: string }[];
}

const Terminal: React.FC<TerminalProps> = ({ onSubmit, isLoading, history }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSubmit(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full bg-retro-black border-2 border-retro-green rounded-lg shadow-[0_0_20px_rgba(51,255,0,0.2)] overflow-hidden font-mono text-sm sm:text-base">
      
      {/* Header */}
      <div className="bg-retro-green text-retro-black p-2 flex items-center justify-between font-bold">
        <div className="flex items-center gap-2">
          <TerminalIcon size={18} />
          <span>SYSTEM_BRAIN.exe</span>
        </div>
        <div className="flex gap-2">
          <span className="w-3 h-3 bg-retro-black rounded-full opacity-50"></span>
          <span className="w-3 h-3 bg-retro-black rounded-full opacity-50"></span>
        </div>
      </div>

      {/* Output Log */}
      <div className="flex-1 p-4 overflow-y-auto space-y-4 text-green-400">
        <div className="opacity-70">
          <p>{'>'} INITIALIZING LOGIC CORE...</p>
          <p>{'>'} AWAITING CREATIVE INPUT.</p>
        </div>
        
        {history.map((msg, idx) => (
          <div key={idx} className={`${msg.role === 'user' ? 'text-white' : 'text-retro-green'}`}>
            <span className="font-bold mr-2">{msg.role === 'user' ? 'USER >>' : 'SYS >>'}</span>
            <span className="whitespace-pre-wrap">{msg.text}</span>
          </div>
        ))}
        
        {isLoading && (
          <div className="text-retro-green animate-pulse">
            {'>'} PROCESSING...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t border-retro-green/30 bg-black/50 p-3 flex gap-2">
        <span className="text-retro-green font-bold py-2">{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe your game idea (e.g., 'A cyberpunk ninja platformer')"
          className="flex-1 bg-transparent text-white outline-none placeholder-green-700/50"
          disabled={isLoading}
          autoFocus
        />
        <button 
          type="submit" 
          disabled={isLoading || !input.trim()}
          className="text-retro-green hover:text-white disabled:opacity-30 transition-colors"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default Terminal;