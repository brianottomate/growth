"use client";

import { useRef, useState, type FormEvent } from "react";
import { ArrowUp, Plus, LoaderCircle } from "lucide-react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  specForTopic,
  type DemoEvent,
  type Topic,
} from "@/lib/os-demo/catalog";
import { registry } from "./previews";
import s from "./os-faq.module.css";

type Entry = {
  id: string;
  question: string;
  answer: string;
  topic: Topic;
  pending?: boolean;
  error?: string;
};
const initialEntries: Entry[] = [
  {
    id: "what",
    question: "What is WanderOS?",
    answer:
      "WanderOS is a direct booking platform that helps property managers create beautiful, high-converting websites in minutes. We handle everything from design to payments to analytics, so you can focus on running your business.",
    topic: "website",
  },
  {
    id: "why",
    question: "Why do I need my own booking site?",
    answer:
      "Your own booking site gives you control over your brand and builds direct relationships with your guests. WanderOS brings your properties, booking experience, and payments together on your own website.",
    topic: "website",
  },
  {
    id: "compete",
    question: "How does it help me compete with larger brands?",
    answer:
      "WanderOS gives property managers access to search optimization, conversion-focused websites, and marketing tools to help attract more direct bookings.",
    topic: "marketing",
  },
  {
    id: "replace",
    question: "Does this replace my PMS?",
    answer:
      "No, WanderOS works alongside your existing PMS. We integrate directly with your property management system to sync listings, availability, and pricing automatically. Your PMS remains your single source of truth for operations.",
    topic: "integrations",
  },
  {
    id: "pms",
    question: "What PMS do you integrate with?",
    answer:
      "WanderOS integrates with property management systems including Hostaway, Guesty, Streamline, Escapia, Track, and Rentals United. Ask the WanderOS team about your specific provider and setup.",
    topic: "integrations",
  },
];

export function OsFaq() {
  const [entries, setEntries] = useState(initialEntries);
  const [open, setOpen] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const previous = useRef<Entry | null>(null);
  function update(id: string, patch: Partial<Entry>) {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  async function ask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = question.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const id = crypto.randomUUID();
    const entry: Entry = {
      id,
      question: text,
      answer: "",
      topic: "unsupported",
      pending: true,
    };
    setEntries((current) => [...current, entry]);
    setOpen(id);
    setPreview(null);
    setQuestion("");
    try {
      const response = await fetch("/api/lab/os-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          previousQuestion: previous.current?.question,
          previousTopic: previous.current?.topic,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Please try your question again.");
      }
      if (!response.body)
        throw new Error("No answer received. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as DemoEvent;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "preview") {
            entry.topic = event.topic;
            update(id, { topic: event.topic });
          }
          if (event.type === "answer") {
            completed = true;
            entry.answer = event.text;
            update(id, { answer: event.text, pending: false });
          }
        }
      }
      if (!completed)
        throw new Error("The answer was interrupted. Please try again.");
      previous.current = entry;
    } catch (error) {
      update(id, {
        pending: false,
        error:
          error instanceof Error
            ? error.message
            : "Please try your question again.",
      });
      setQuestion(text);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      id="wander-faq"
      className={s.section}
      aria-labelledby="wander-faq-heading"
    >
      <div className={s.layout}>
        <div className={s.intro}>
          <h2 id="wander-faq-heading">
            Questions?<span>We’ve got answers.</span>
          </h2>
        </div>
        <div className={s.list}>
          {entries.map((entry) => {
            const expanded = open === entry.id;
            const spec = specForTopic(entry.topic);
            return (
              <div className={s.item} key={entry.id}>
                <h3>
                  <button
                    id={`wander-faq-q-${entry.id}`}
                    className={s.toggle}
                    aria-expanded={expanded}
                    aria-controls={`wander-faq-a-${entry.id}`}
                    onClick={() => {
                      setOpen(expanded ? null : entry.id);
                      if (!entry.pending && !entry.error)
                        previous.current = entry;
                    }}
                  >
                    <span>{entry.question}</span>
                    <Plus
                      size={24}
                      strokeWidth={1.5}
                      className={expanded ? s.close : undefined}
                    />
                  </button>
                </h3>
                <div
                  id={`wander-faq-a-${entry.id}`}
                  role="region"
                  aria-labelledby={`wander-faq-q-${entry.id}`}
                  hidden={!expanded}
                  className={s.answer}
                >
                  <div aria-live="polite">
                    {entry.pending ? (
                      <p className={s.loading}>
                        <LoaderCircle size={16} className={s.spin} /> Finding
                        your answer…
                      </p>
                    ) : entry.error ? (
                      <p role="alert">{entry.error}</p>
                    ) : (
                      <p>{entry.answer}</p>
                    )}
                  </div>
                  {spec && (
                    <>
                      <button
                        type="button"
                        className={s.previewButton}
                        aria-expanded={preview === entry.id}
                        aria-controls={`wander-faq-preview-${entry.id}`}
                        onClick={() =>
                          setPreview(preview === entry.id ? null : entry.id)
                        }
                      >
                        {preview === entry.id
                          ? "Hide example"
                          : "See what it looks like"}
                        <Plus
                          size={14}
                          className={preview === entry.id ? s.close : undefined}
                        />
                      </button>
                      <div
                        id={`wander-faq-preview-${entry.id}`}
                        hidden={preview !== entry.id}
                      >
                        {preview === entry.id && (
                          <div className={s.preview}>
                            <JSONUIProvider registry={registry}>
                              <Renderer spec={spec} registry={registry} />
                            </JSONUIProvider>
                            <p>Illustrative product preview · Sample data</p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <form className={s.form} onSubmit={ask}>
            <label htmlFor="wander-faq-input">
              Something else on your mind?
            </label>
            <div className={s.inputWrap}>
              <input
                id="wander-faq-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={600}
                disabled={busy}
                placeholder="Ask your own question"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                aria-label="Ask your FAQ question"
              >
                {busy ? (
                  <LoaderCircle size={19} className={s.spin} />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
