"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { Question, RetentionAssessment, RetentionRoundSummary, RetentionTestStart } from "../lib/types";
import { Metric } from "./Metric";
import { NumberPad } from "./NumberPad";

function formatMs(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function RetentionTest({
  assessment,
  onBackHome,
  onComplete,
  onShowDashboard,
}: {
  assessment: RetentionAssessment;
  onBackHome: () => void;
  onComplete: (assessment: RetentionAssessment) => void;
  onShowDashboard: () => void;
}) {
  const [started, setStarted] = useState<RetentionTestStart | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<{ question_id: number; answer: string; response_time_ms: number }[]>([]);
  const [result, setResult] = useState<RetentionAssessment | null>(null);
  const [message, setMessage] = useState("Loading recall check...");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api<RetentionTestStart>(`/retention-assessments/${assessment.assessment_id}/start`, { method: "POST" })
      .then((data) => {
        if (cancelled) return;
        setStarted(data);
        setQuestions(data.questions);
        setMessage("");
        startedAtRef.current = performance.now();
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not start the recall check.");
      });
    return () => { cancelled = true; };
  }, [assessment.assessment_id]);

  function setInput(value: string) {
    if (inputRef.current) inputRef.current.value = value;
  }

  function focusInput() {
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  async function submitAnswer() {
    const current = questions[index];
    const answer = inputRef.current?.value.trim() || "";
    if (!current || !started || !answer || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    const nextAnswers = [
      ...answers,
      {
        question_id: current.question_id,
        answer,
        response_time_ms: Math.round(performance.now() - startedAtRef.current),
      },
    ];
    setInput("");
    if (index + 1 < questions.length) {
      setAnswers(nextAnswers);
      setIndex((currentIndex) => currentIndex + 1);
      startedAtRef.current = performance.now();
      setSubmitting(false);
      submittingRef.current = false;
      focusInput();
      return;
    }

    try {
      const data = await api<{ assessment: RetentionAssessment; completed_round_key: string }>(
        `/retention-assessments/${assessment.assessment_id}/submit`,
        {
          method: "POST",
          body: JSON.stringify({ round_id: started.round_id, answers: nextAnswers }),
        },
      );
      setQuestions([]);
      setResult(data.assessment);
      onComplete(data.assessment);
    } catch (error) {
      setInput(answer);
      setMessage(error instanceof Error ? error.message : "Could not save the recall check. Your answer is still here.");
      setSubmitting(false);
      submittingRef.current = false;
      focusInput();
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer();
  }

  function pressNumberPad(key: string) {
    if (submitting) return;
    const current = inputRef.current?.value.trim() || "";
    if (key === "enter") {
      submitAnswer();
    } else if (key === "backspace") {
      setInput(current.slice(0, -1));
      focusInput();
    } else if (key === "clear") {
      setInput("");
      focusInput();
    } else {
      setInput(`${current}${key}`.slice(0, 4));
      focusInput();
    }
  }

  function backHome() {
    if (questions.length > 0 && !window.confirm("Leave this recall check and go home? Current answers will not be saved.")) return;
    onBackHome();
  }

  const current = questions[index];
  const completedRound = result?.rounds.find((item) => item.round_key === started?.round_key) as RetentionRoundSummary | undefined;

  return (
    <section className="panel retentionTestPage">
      {!result && (
        <button type="button" className="focusBackButton" onClick={backHome} aria-label="Back to home">
          <span aria-hidden="true">←</span>
        </button>
      )}
      {message && !current && !result && <p className="retentionLoading" role="status">{message}</p>}
      {current && (
        <div className="practiceSurface compact retentionQuestionSurface">
          <div className="progressLine">{index + 1} of {questions.length}</div>
          <div className="questionText">{current.prompt}</div>
          <form className="answerRow" onSubmit={submit}>
            <input
              ref={inputRef}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={4}
              aria-label="Answer"
              aria-busy={submitting}
              readOnly={submitting}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitAnswer();
                }
              }}
            />
          </form>
          <NumberPad onPress={pressNumberPad} disabled={submitting} />
          <div className="feedback" aria-live="polite">{submitting ? "Accepted..." : ""}</div>
        </div>
      )}
      {result && completedRound && (
        <div className="results retentionResults">
          <p className="eyebrow">{completedRound.label}</p>
          <h2>Recall check complete</h2>
          <p>Your answers and recall speed have been recorded. There were no countdown clocks and no answers were shown during the check.</p>
          <div className="metricGrid">
            <Metric label="Accuracy" value={`${Math.round(completedRound.accuracy * 100)}%`} />
            <Metric label="Correct" value={`${completedRound.correct_count}/${completedRound.question_count}`} />
            <Metric label="Average recall" value={formatMs(completedRound.average_time_ms)} />
            <Metric label="Median recall" value={formatMs(completedRound.median_time_ms)} />
          </div>
          {result.next_round_key && result.next_due_at ? (
            <div className="retentionNextStep">
              <strong>Next: {result.next_round_label}</strong>
              <p>Planned for {formatDate(result.next_due_at)}. Ordinary practice can continue as normal.</p>
            </div>
          ) : (
            <div className="retentionNextStep"><strong>All three checks are complete.</strong><p>The full comparison is ready in the dashboard.</p></div>
          )}
          <div className="actionRow">
            <button type="button" className="secondaryButton" onClick={onBackHome}>Home</button>
            <button type="button" onClick={onShowDashboard}>See results</button>
          </div>
        </div>
      )}
    </section>
  );
}
