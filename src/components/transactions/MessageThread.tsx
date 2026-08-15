import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useCurrentUserId } from "@/hooks/useCurrentUserId";

interface ThreadMessage {
  id: string;
  transaction_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  message_text: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
  sender_name: string;
  sender_avatar_url: string | null;
  is_mine: boolean;
}

interface MessageThreadProps {
  transactionId: string;
  /** "Reply to {counterpartyName}" — used as the visible label on the send button */
  counterpartyName: string;
}

async function fetchMessages(transactionId: string): Promise<{ items: ThreadMessage[]; current_user_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke("transaction-messages", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { op: "list", transaction_id: transactionId },
  });
  if (error || data?.error) throw new Error(data?.error || error?.message || "Failed to load messages");
  return data;
}

async function markRead(transactionId: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.functions.invoke("transaction-messages", {
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: { op: "mark_read", transaction_id: transactionId },
  });
}

export function MessageThread({ transactionId, counterpartyName }: MessageThreadProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUserId = useCurrentUserId();
  const { typingUsers, notifyTyping } = useTypingIndicator(transactionId, currentUserId, "You");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transaction-messages", transactionId],
    queryFn: () => fetchMessages(transactionId),
    staleTime: 10_000,
  });

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data?.items.length]);

  // Mark messages as read when thread opens / new messages arrive
  useEffect(() => {
    if (!data?.items.length) return;
    const hasUnreadForMe = data.items.some(
      (m) => !m.is_read && m.recipient_user_id === data.current_user_id
    );
    if (hasUnreadForMe) {
      markRead(transactionId).then(() => {
        qc.invalidateQueries({ queryKey: ["transaction-messages", transactionId] });
      }).catch(() => { /* non-fatal */ });
    }
  }, [data, transactionId, qc]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`transaction-messages-${transactionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transaction_messages",
          filter: `transaction_id=eq.${transactionId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["transaction-messages", transactionId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [transactionId, qc]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (trimmed.length < 10) {
      toast({
        title: "Message too short",
        description: "Please write at least 10 characters.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");
      const { data: result, error } = await supabase.functions.invoke("send-seller-message", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { transaction_id: transactionId, message: trimmed },
      });
      if (error || result?.error) throw new Error(result?.error || error?.message || "Failed to send");
      setDraft("");
      await refetch();
    } catch (err: any) {
      toast({
        title: "Failed to send",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card id="messages" className="rounded-2xl shadow-lg overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-border bg-muted/30">
        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          Messages
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Secure conversation with {counterpartyName}. Do not share payment details outside the platform.
        </p>
      </div>

      <div className="max-h-[420px] overflow-y-auto p-4 sm:p-6 space-y-4 bg-background">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {isError && (
          <div className="text-center text-sm text-destructive py-8">
            Could not load messages. <button onClick={() => refetch()} className="underline min-h-11 inline-flex items-center px-3">Retry</button>
          </div>
        )}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <div className="text-center text-sm text-muted-foreground py-8">
            No messages yet. Start the conversation below.
          </div>
        )}
        {data?.items.map((m) => {
          const initials = m.sender_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
          return (
            <div key={m.id} className={cn("flex gap-3", m.is_mine ? "flex-row-reverse" : "flex-row")}>
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={m.sender_avatar_url ?? undefined} alt={m.sender_name} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[75%]", m.is_mine ? "items-end" : "items-start", "flex flex-col gap-1")}>
                <div className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words",
                  m.is_mine
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm"
                )}>
                  {m.message_text}
                </div>
                <div className="text-xs text-muted-foreground px-1">
                  {m.is_mine ? "You" : m.sender_name} · {format(new Date(m.created_at), "MMM d, h:mm a")}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-4 bg-card">
        {typingUsers.length > 0 && (
          <div className="mb-2 text-xs text-muted-foreground italic">
            {counterpartyName} is typing…
          </div>
        )}
        <Textarea
          placeholder={`Reply to ${counterpartyName}… (min. 10 characters)`}
          value={draft}
          onChange={(e) => { setDraft(e.target.value); notifyTyping(); }}
          className="min-h-[80px] resize-none text-sm mb-3"
          disabled={sending}
        />
        <div className="flex items-center justify-between gap-3">
          <span className={cn(
            "text-xs",
            draft.trim().length > 0 && draft.trim().length < 10
              ? "text-destructive"
              : "text-muted-foreground"
          )}>
            {draft.trim().length} / min. 10 chars
          </span>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || draft.trim().length < 10}
            className="font-semibold"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
