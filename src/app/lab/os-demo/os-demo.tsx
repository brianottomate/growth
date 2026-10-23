"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { JSONUIProvider, Renderer } from "@json-render/react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronRight,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import {
  demos,
  specForTopic,
  type Topic,
  type DemoEvent,
} from "@/lib/os-demo/catalog";
import { registry } from "./previews";
import { OsFaq } from "./os-faq";
import s from "./os-demo.module.css";

type Result = {
  question: string;
  topic: Topic;
  answer: string;
  confidence?: number;
  selectionMs?: number;
  totalMs?: number;
  source?: string;
};
export function OsDemo() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"ask" | "browse">("ask");
  const [inspect, setInspect] = useState(false);
  async function ask(value: string) {
    const text = value.trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setQuestion("");
    const previous = result;
    setResult(null);
    try {
      const response = await fetch("/api/lab/os-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          previousQuestion: previous?.question,
          previousTopic: previous?.topic,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(
          data.error ?? "The demo is unavailable. Please try again.",
        );
      }
      if (!response.body)
        throw new Error("No response received. Please try again.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as DemoEvent;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "preview")
            setResult({
              question: text,
              topic: event.topic,
              answer: "",
              confidence: event.confidence,
              selectionMs: event.selectionMs,
            });
          if (event.type === "answer") {
            completed = true;
            setResult((current) =>
              current
                ? {
                    ...current,
                    answer: event.text,
                    totalMs: event.totalMs,
                    source: event.source,
                  }
                : current,
            );
          }
        }
      }
      if (!completed)
        throw new Error("The response was interrupted. Please try again.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      setQuestion(text);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function browse(topic: keyof typeof demos) {
    setError("");
    setResult({
      question: demos[topic].question,
      topic,
      answer: demos[topic].facts,
      source: "reference",
    });
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void ask(question);
  }
  const topic = result?.topic ?? "website";
  const spec = specForTopic(topic);
  return (
    <main className={s.page}>
      <header className={s.header}>
        <Link href="/lab" className={s.back}>
          <ArrowLeft size={15} /> Growth Lab
        </Link>
        <span className={s.brand}>
          wander<span>OS</span>
        </span>
        <span className={s.labBadge}>
          <span /> Experimental
        </span>
      </header>
      <section className={s.intro}>
        <span className={s.eyebrow}>
          A LITTLE LESS TELL. A LITTLE MORE SHOW.
        </span>
        <h1>
          Meet your next
          <br />
          <em>chapter in hospitality.</em>
        </h1>
        <p>
          Ask about WanderOS. See what it could look like for your business.
        </p>
      </section>
      <div className={s.experience}>
        <section className={s.conversation} aria-label="Ask about WanderOS">
          <div className={s.modeSwitch} aria-label="Demo mode">
            <button
              type="button"
              aria-pressed={mode === "ask"}
              onClick={() => setMode("ask")}
              disabled={busy}
            >
              <Sparkles size={14} /> Ask WanderOS
            </button>
            <button
              type="button"
              aria-pressed={mode === "browse"}
              onClick={() => setMode("browse")}
              disabled={busy}
            >
              Browse examples
            </button>
          </div>
          <h2>
            {mode === "ask" ? "What’s on your mind?" : "Take a look around."}
          </h2>
          <p className={s.helper}>
            {mode === "ask"
              ? "Start with a question, or try one of these."
              : "Explore the same previews without an AI request."}
          </p>
          <div className={s.questions}>
            {Object.entries(demos).map(([id, demo]) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                data-selected={result?.topic === id}
                onClick={() =>
                  mode === "browse"
                    ? browse(id as keyof typeof demos)
                    : void ask(demo.question)
                }
              >
                {demo.question}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
          <div aria-live="polite" className={s.answerArea}>
            {busy && !result && (
              <div className={s.loading}>
                <LoaderCircle size={17} className={s.spin} /> Finding the right
                view…
              </div>
            )}
            {result && (
              <>
                <div className={s.asked}>{result.question}</div>
                <div className={s.answerIcon}>
                  <Sparkles size={16} /> WanderOS
                </div>
                <p className={s.answer}>
                  {result.answer ||
                    "Your preview is ready. Writing your answer…"}
                </p>
                {!busy && result.topic !== "unsupported" && mode === "ask" && (
                  <button
                    className={s.followup}
                    onClick={() =>
                      void ask(
                        demos[result.topic as keyof typeof demos].followup,
                      )
                    }
                  >
                    {demos[result.topic].followup}
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </>
            )}
            {!result && !busy && (
              <div className={s.empty}>
                <span className={s.answerIcon}>
                  <Sparkles size={16} /> Built around your questions
                </span>
                <p>
                  Your answer and a matching product preview appear here. Choose
                  a question to see it in action.
                </p>
              </div>
            )}
          </div>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          {mode === "ask" && (
            <form onSubmit={submit} className={s.form}>
              <label className={s.srOnly} htmlFor="os-question">
                Your WanderOS question
              </label>
              <input
                id="os-question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a follow-up or something new…"
                maxLength={600}
                disabled={busy}
              />
              <button
                type="submit"
                aria-label="Ask question"
                disabled={busy || !question.trim()}
              >
                {busy ? (
                  <LoaderCircle size={19} className={s.spin} />
                ) : (
                  <ArrowUp size={19} />
                )}
              </button>
            </form>
          )}
          <p className={s.privacy}>
            Internal experiment · Use sample questions; don’t enter guest
            details.
          </p>
        </section>
        <section
          className={s.previewPanel}
          aria-label="Product preview"
          aria-busy={busy}
        >
          <div className={s.previewLabel}>
            <span>
              <span className={s.liveDot} /> PRODUCT PREVIEW
            </span>
            <span>Illustrative · Sample data</span>
          </div>
          <div className={s.previewTitle}>
            <h2>
              {topic === "unsupported"
                ? "Let’s find the right answer."
                : demos[topic].title}
            </h2>
            <p>
              {topic === "unsupported"
                ? "This question needs more information than our demo has."
                : "A glimpse of the experience. Tailored to your question."}
            </p>
          </div>
          <div className={s.previewCanvas}>
            {spec ? (
              <JSONUIProvider registry={registry}>
                <Renderer spec={spec} registry={registry} />
              </JSONUIProvider>
            ) : (
              <div className={s.noPreview}>
                <Sparkles size={30} />
                <h3>There’s more to talk about.</h3>
                <p>
                  Try a website, marketing, integration, or analytics question
                  to explore a product preview.
                </p>
              </div>
            )}
          </div>
          <div className={s.previewFooter}>
            <span>
              <Check size={14} /> Curated product examples
            </span>
            <a
              href="https://www.wander.com/os"
              target="_blank"
              rel="noreferrer"
            >
              Explore WanderOS <ArrowUpRight size={14} />
            </a>
          </div>
        </section>
      </div>
      <footer className={s.footer}>
        <span>A Growth experiment in showing, not just explaining.</span>
        <button onClick={() => setInspect(!inspect)} aria-expanded={inspect}>
          {" "}
          {inspect ? "Hide" : "Show"} experiment details
        </button>
      </footer>
      {inspect && (
        <section className={s.diagnostics}>
          <strong>JEV selects → json-render displays → Claude explains</strong>
          <p>
            Preview: {topic} · Selection:{" "}
            {result?.selectionMs === undefined
              ? "not measured"
              : `${result.selectionMs} ms`}{" "}
            · Total:{" "}
            {result?.totalMs === undefined
              ? "not measured"
              : `${result.totalMs} ms`}{" "}
            · Choice confidence:{" "}
            {result?.confidence === undefined
              ? "n/a"
              : result.confidence.toFixed(3)}{" "}
            · Answer: {result?.source ?? "pending"}
          </p>
          <p>
            Confidence describes the model’s choice distribution, not factual
            correctness. Browse mode makes no model calls. No guest data is
            loaded, and no campaigns or sites are published.
          </p>
          <a href="https://www.wander.com/os" target="_blank" rel="noreferrer">
            Product facts: WanderOS public page
          </a>
        </section>
      )}
      <OsFaq />
    </main>
  );
}
