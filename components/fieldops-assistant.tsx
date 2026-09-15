"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  Code2,
  ExternalLink,
  Globe2,
  MessageCircleMore,
  Send,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  assistantPrompts,
  resolveAssistantResponse,
  welcomeReply,
  type AssistantLink,
  type AssistantReply,
} from "@/lib/fieldops-assistant";
import styles from "./fieldops-assistant.module.css";

type ChatMessage =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; reply: AssistantReply };

const linkIcons: Record<string, ReactNode> = {
  LinkedIn: <UserRound aria-hidden="true" />,
  GitHub: <Code2 aria-hidden="true" />,
  Portfolio: <Globe2 aria-hidden="true" />,
};

function ReplyLinks({ links }: { links: AssistantLink[] }) {
  return (
    <div className={styles.linkGrid} aria-label="Professional links">
      {links.map((link) => (
        <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
          <span>{linkIcons[link.label] ?? <ExternalLink aria-hidden="true" />}</span>
          <strong>{link.label}</strong>
          <ExternalLink aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function AssistantMessage({ reply }: { reply: AssistantReply }) {
  return (
    <div className={`${styles.message} ${styles.assistantMessage}`}>
      <div className={styles.avatar}><Bot aria-hidden="true" /></div>
      <div className={styles.messageBody}>
        {reply.title && <strong className={styles.messageTitle}>{reply.title}</strong>}
        {reply.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {reply.bullets && (
          <ul>
            {reply.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
          </ul>
        )}
        {reply.links && <ReplyLinks links={reply.links} />}
      </div>
    </div>
  );
}

export function FieldOpsAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 1, role: "assistant", reply: welcomeReply },
  ]);
  const nextId = useRef(2);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;

    const userId = nextId.current++;
    const assistantId = nextId.current++;
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", text: trimmed },
      { id: assistantId, role: "assistant", reply: resolveAssistantResponse(trimmed, pathname) },
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(input);
  }

  return (
    <div className={styles.assistantRoot}>
      {open && (
        <section className={styles.panel} role="dialog" aria-modal="false" aria-labelledby="fieldops-assistant-title">
          <header className={styles.panelHeader}>
            <div className={styles.headerIdentity}>
              <span className={styles.headerIcon}><Sparkles aria-hidden="true" /></span>
              <div>
                <strong id="fieldops-assistant-title">FieldOps Context Assistant</strong>
                <span><i /> CURATED LOCAL KNOWLEDGE</span>
              </div>
            </div>
            <button type="button" className={styles.closeButton} onClick={() => setOpen(false)} aria-label="Close FieldOps context assistant">
              <X aria-hidden="true" />
            </button>
          </header>

          <div className={styles.contextBar}>
            <Bot aria-hidden="true" />
            <span>Product, architecture, operations, and creator context</span>
          </div>

          <div className={styles.starters}>
            <span>TRY A QUESTION</span>
            <div>
              {assistantPrompts.map((prompt) => (
                <button type="button" key={prompt} onClick={() => ask(prompt)}>{prompt}</button>
              ))}
            </div>
          </div>

          <div className={styles.transcript} ref={transcriptRef} aria-live="polite">
            {messages.map((message) => message.role === "user" ? (
              <div className={`${styles.message} ${styles.userMessage}`} key={message.id}>
                <div className={styles.messageBody}><p>{message.text}</p></div>
              </div>
            ) : <AssistantMessage key={message.id} reply={message.reply} />)}
          </div>

          <form className={styles.composer} onSubmit={handleSubmit}>
            <label htmlFor="fieldops-assistant-input" className={styles.srOnly}>Ask the FieldOps Context Assistant</label>
            <input
              ref={inputRef}
              id="fieldops-assistant-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about FieldOps or Michael Palmer..."
              autoComplete="off"
              maxLength={280}
            />
            <button type="submit" disabled={!input.trim()} aria-label="Send question">
              <Send aria-hidden="true" />
            </button>
          </form>
          <footer className={styles.panelFooter}>Deterministic in-app knowledge. No external model request.</footer>
        </section>
      )}

      <button
        type="button"
        className={`${styles.launcher} ${open ? styles.launcherOpen : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? "Close FieldOps Context Assistant" : "Open FieldOps Context Assistant"}
        aria-expanded={open}
      >
        <MessageCircleMore aria-hidden="true" />
        <span>AI</span>
      </button>
    </div>
  );
}
