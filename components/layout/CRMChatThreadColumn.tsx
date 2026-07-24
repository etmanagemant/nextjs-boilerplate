"use client";

import { useRef, useEffect, useState } from "react";
import { ChatMessage } from "@/app/crm-inbox/types";
import SmileLeiste from "./CRMSmileLeiste";

interface ChatThreadColumnProps {
  messages: ChatMessage[];
  currentMessage: string;
  onMessageChange: (text: string) => void;
  onSendMessage: () => void;
  emojis: string[];
  selectedEmoji?: string;
  isLoading: boolean;
  isSending: boolean;
}

export default function ChatThreadColumn({
  messages,
  currentMessage,
  onMessageChange,
  onSendMessage,
  emojis,
  selectedEmoji,
  isLoading,
  isSending,
}: ChatThreadColumnProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle emoji insertion
  const handleEmojiClick = (emoji: string) => {
    if (!textareaRef.current) return;

    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;

    const newText =
      currentMessage.substring(0, start) +
      emoji +
      currentMessage.substring(end);

    onMessageChange(newText);

    // Set cursor position after emoji
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart =
          textareaRef.current.selectionEnd = start + emoji.length;
        textareaRef.current.focus();
      }
    }, 0);
  };

  return (
    <div className="h-full flex flex-col bg-[#0A0A0A] border-r border-[#D4AF37]/20">
      {/* Header */}
      <div className="bg-black/60 p-4 border-b border-[#D4AF37]/20">
        <h2 className="text-sm font-black text-[#D4AF37] uppercase tracking-wider">
          💬 Chat Thread
        </h2>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="w-8 h-8 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin mx-auto mb-2"></div>
              <p className="text-xs text-slate-400">Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-slate-500">
              No messages yet. Start a conversation!
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.sender === "chatter" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-xs px-4 py-3 rounded-lg ${
                    msg.sender === "chatter"
                      ? "bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A0A0A]"
                      : "bg-black/60 border border-[#8A6D3F]/20 text-[#F3E5AB]"
                  }`}
                >
                  <p className="text-sm break-words">{msg.message_text}</p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-xs opacity-70" suppressHydrationWarning>
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    {msg.sender === "chatter" && (
                      <div className="text-xs" title={msg.sent_to_platform ? "Sent to OnlyFans" : "Saving locally..."}>
                        {msg.sent_to_platform ? "✓✓" : "✓"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Emoji Bar */}
      <div className="px-4 py-3 border-t border-[#8A6D3F]/20">
        <SmileLeiste emojis={emojis} onEmojiClick={handleEmojiClick} />
      </div>

      {/* Message Input */}
      <div className="p-4 bg-black/40 border-t border-[#D4AF37]/20 space-y-3">
        <textarea
          ref={textareaRef}
          value={currentMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Type a message... (Emojis available above)"
          className="w-full h-24 bg-black/60 border border-[#D4AF37]/30 rounded-lg px-4 py-3 text-sm text-[#F3E5AB] placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] resize-none"
          disabled={isSending}
        />

        <button
          onClick={onSendMessage}
          disabled={!currentMessage.trim() || isSending}
          className={`w-full py-3 px-4 rounded-lg font-bold uppercase tracking-wider text-sm transition ${
            !currentMessage.trim() || isSending
              ? "bg-slate-600/30 text-slate-500 cursor-not-allowed"
              : "bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-[#0A0A0A] hover:shadow-lg hover:shadow-[#D4AF37]/50"
          }`}
        >
          {isSending ? "📤 Sending..." : "✓ Send Message"}
        </button>
      </div>
    </div>
  );
}
