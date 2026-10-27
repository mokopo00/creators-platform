import { useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { errorMessage, post } from '../lib/api';
import { buttonClass } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Tabs } from '../ui/Tabs';

type Msg = { from: 'user' | 'bot'; text: string; error?: boolean };

/** Help chatbot: FAQ answers and request-template drafting (Workers AI). */
export function Chatbot() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'faq' | 'template'>('faq');
  const [text, setText] = useState('');
  const [log, setLog] = useState<Msg[]>([
    { from: 'bot', text: '支払い・納期遅延・手数料などのご質問にお答えします。' },
  ]);
  const m = useMutation({
    mutationFn: (message: string) => post<{ reply: string }>('/api/ai/chatbot', { mode, message }),
    onSuccess: (r) => setLog((l) => [...l, { from: 'bot', text: r.reply }]),
    onError: (e) => setLog((l) => [...l, { from: 'bot', text: errorMessage(e), error: true }]),
  });

  return (
    <div className="fixed bottom-24 right-4 z-40 md:bottom-6">
      <AnimatePresence>
        {open && (
          <motion.section
            role="dialog"
            aria-label="ヘルプチャット"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="glass glass-strong mb-3 flex h-[26rem] w-[min(22rem,calc(100vw-2rem))] flex-col p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <Tabs
                label="チャットの種類"
                value={mode}
                onChange={setMode}
                items={[
                  { value: 'faq', label: 'よくある質問' },
                  { value: 'template', label: 'テンプレート作成' },
                ]}
              />
              <button
                type="button"
                aria-label="閉じる"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full text-ink-soft hover:bg-white/70 hover:text-ink"
              >
                <Icon name="close" />
              </button>
            </div>
            <ol
              className="flex flex-1 flex-col gap-2 overflow-y-auto text-sm"
              aria-live="polite"
              data-testid="chatbot-log"
            >
              {log.map((msg, i) => (
                <li
                  key={i}
                  className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 ${msg.from === 'user' ? 'self-end bg-accent text-white' : msg.error ? 'self-start bg-white/80 text-danger' : 'self-start bg-white/80'}`}
                >
                  {msg.text}
                </li>
              ))}
              {m.isPending && <li className="self-start text-xs text-ink-soft">回答を作成中…</li>}
            </ol>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = text.trim();
                if (!t) return;
                setLog((l) => [...l, { from: 'user', text: t }]);
                setText('');
                m.mutate(t);
              }}
            >
              <label htmlFor="chatbot-input" className="sr-only">
                質問
              </label>
              <input
                id="chatbot-input"
                value={text}
                maxLength={1000}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  mode === 'faq' ? '質問を入力' : '依頼したい内容（例：キャラクターの立ち絵）'
                }
                className="flex-1 rounded-xl bg-white/70 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <button type="submit" className={buttonClass('primary', 'md')} disabled={m.isPending}>
                <Icon name="send" size="sm" />
                送信
              </button>
            </form>
          </motion.section>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        aria-expanded={open}
        aria-label="ヘルプチャットを開く"
        onClick={() => setOpen((o) => !o)}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.95 }}
        className="ml-auto flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-[0_8px_24px_rgba(79,85,200,0.4)]"
      >
        <Icon name={open ? 'close' : 'help'} size="lg" />
      </motion.button>
    </div>
  );
}
