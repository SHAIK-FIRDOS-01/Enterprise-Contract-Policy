import React, { useRef } from 'react';
import { Send, Square, Sparkles } from 'lucide-react';

const AUDIT_PLAYBOOKS = [
  'Audit Indemnification Caps & Aggregate Liability Limits',
  'Check Governing Law, Dispute Resolution & Jurisdiction',
  'Verify Non-Compete, Confidentiality & Termination Terms',
];

export default function AuditQueryInput({
  query = '',
  onQueryChange,
  onSubmit,
  isStreaming = false,
  onCancel,
  disabled = false,
}) {
  const textareaRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && query.trim() && onSubmit) {
        onSubmit();
      }
    }
  };

  const handlePlaybookClick = (prompt) => {
    if (onQueryChange) {
      onQueryChange(prompt);
    }
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const isSubmitDisabled = disabled || !query.trim() || isStreaming;

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/90 p-3 space-y-2.5 font-sans">
      {/* Preset Playbook Buttons */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-mono scrollbar-none">
        <span className="text-zinc-500 flex items-center gap-1 flex-shrink-0 text-[10px]">
          <Sparkles className="w-3 h-3 text-amber-400" />
          PLAYBOOKS:
        </span>
        {AUDIT_PLAYBOOKS.map((pb, idx) => (
          <button
            key={idx}
            type="button"
            disabled={isStreaming || disabled}
            onClick={() => handlePlaybookClick(pb)}
            className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors whitespace-nowrap text-[10px] flex-shrink-0 disabled:opacity-40"
          >
            {pb}
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div className="relative rounded border border-zinc-800 bg-zinc-950 focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-400/50 transition-all">
        <textarea
          ref={textareaRef}
          value={query}
          onChange={(e) => onQueryChange && onQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={2}
          placeholder="Ask compliance or legal questions (e.g. 'What is the indemnity clause limitation?'). Press Enter to query..."
          className="w-full bg-transparent p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none font-mono leading-relaxed"
        />

        {/* Toolbar & Action Buttons */}
        <div className="h-8 px-2.5 pb-1 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500">
              [ENTER] SUBMIT • [SHIFT+ENTER] NEWLINE
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isStreaming ? (
              <button
                type="button"
                onClick={onCancel}
                aria-label="HALT STREAM"
                className="h-6 px-2.5 rounded bg-rose-950 border border-rose-800 text-rose-300 hover:bg-rose-900 text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>HALT STREAM</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={isSubmitDisabled}
                aria-label="SUBMIT QUERY"
                className="h-6 px-3 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors shadow"
              >
                <Send className="w-2.5 h-2.5" />
                <span>SUBMIT QUERY</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
