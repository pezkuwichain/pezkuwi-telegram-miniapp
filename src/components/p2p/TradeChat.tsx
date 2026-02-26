import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/i18n';
import { useTelegram } from '@/hooks/useTelegram';
import { getTradeMessages, sendTradeMessage, type P2PMessage } from '@/lib/p2p-api';

interface TradeChatProps {
  tradeId: string;
  onClose: () => void;
}

export function TradeChat({ tradeId, onClose }: TradeChatProps) {
  const { sessionToken, user } = useAuth();
  const { t, isRTL } = useTranslation();
  const { hapticImpact } = useTelegram();

  const [messages, setMessages] = useState<P2PMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  // eslint-disable-next-line no-undef
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const userId = user?.id;

  const fetchMessages = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const msgs = await getTradeMessages(sessionToken, tradeId);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, tradeId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!sessionToken || !newMessage.trim() || sending) return;
    hapticImpact('light');
    setSending(true);
    try {
      await sendTradeMessage(sessionToken, tradeId, newMessage.trim());
      setNewMessage('');
      fetchMessages();
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div
        className={cn(
          'flex items-center justify-between p-4 border-b border-border safe-area-top',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <h2 className="text-lg font-semibold text-foreground">{t('p2p.chat')}</h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{t('p2p.noMessages')}</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.sender_id === userId;
            const isSystem = msg.message_type === 'system';
            return (
              <div
                key={msg.id}
                className={cn(
                  'flex',
                  isSystem ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'
                )}
              >
                {isSystem ? (
                  <span className="text-xs text-muted-foreground bg-muted/50 rounded-full px-3 py-1">
                    {msg.message}
                  </span>
                ) : (
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2',
                      isOwn
                        ? 'bg-cyan-500 text-white rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    )}
                  >
                    <p className="text-sm break-words">{msg.message}</p>
                    <p
                      className={cn(
                        'text-[10px] mt-1',
                        isOwn ? 'text-white/60' : 'text-muted-foreground'
                      )}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div
        className={cn(
          'flex items-center gap-2 p-4 border-t border-border safe-area-bottom',
          isRTL && 'direction-rtl'
        )}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('p2p.messagePlaceholder')}
          className="flex-1 bg-muted rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 border border-border focus:border-cyan-500 focus:outline-none"
          maxLength={2000}
        />
        <button
          onClick={handleSend}
          disabled={!newMessage.trim() || sending}
          className="p-2.5 bg-cyan-500 hover:bg-cyan-600 rounded-full transition-colors disabled:opacity-50"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
