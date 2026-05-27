"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, markRead } from "@/lib/actions/messages";
import type { Message } from "@/lib/domain/types";

export default function ChatView({
  kidId,
  friendId,
  friendName,
  friendAvatar,
  initialMessages,
  accent,
}: {
  kidId: string;
  friendId: string;
  friendName: string;
  friendAvatar: string;
  initialMessages: Message[];
  accent: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length]);

  // Mark conversation as read on mount
  useEffect(() => {
    markRead(kidId, friendId);
  }, [kidId, friendId]);

  // Realtime subscription for incoming messages
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${kidId}:${friendId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `recipient_id=eq.${kidId}`,
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id !== friendId) return;
          setMessages((prev) => [
            ...prev,
            {
              id: msg.id,
              senderId: msg.sender_id,
              recipientId: msg.recipient_id,
              body: msg.body,
              createdAt: msg.created_at,
            },
          ]);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [kidId, friendId]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    setSending(true);
    const optimisticId = `optimistic-${Date.now()}`;
    const optimistic: Message = {
      id: optimisticId,
      senderId: kidId,
      recipientId: friendId,
      body: trimmed,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput("");

    startTransition(async () => {
      const result = await sendMessage(kidId, friendId, trimmed);
      setSending(false);
      if (!result.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      }
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-500 font-bold text-sm px-2 py-1"
        >
          ←
        </button>
        <span className="text-2xl">{friendAvatar}</span>
        <span className="font-black text-gray-900 text-base">{friendName}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-gray-400 mt-8">
            Say hi to {friendName}! 👋
          </p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.senderId === kidId;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"} items-end gap-2`}
            >
              {!isOwn && (
                <span className="text-xl flex-shrink-0">{friendAvatar}</span>
              )}
              <div
                className={`max-w-[72%] px-3 py-2 rounded-2xl text-sm font-semibold leading-snug ${
                  isOwn
                    ? "text-white rounded-br-sm"
                    : "bg-gray-100 text-gray-900 rounded-bl-sm"
                }`}
                style={isOwn ? { background: accent } : undefined}
              >
                {msg.body}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 bg-white flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, 200))}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder="Say something..."
          maxLength={200}
          autoComplete="off"
          autoCorrect="off"
          className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-current"
          style={{ caretColor: accent }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || sending}
          className="text-white font-black px-4 py-2 rounded-xl text-sm disabled:opacity-50"
          style={{ background: accent }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
