"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { LearningRecommendation, Question, RetentionAssessment, RetentionRoundSummary, RetentionTestStart } from "../lib/types";
import { useActiveQuestionTimer } from "../lib/useActiveQuestionTimer";
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
  const [nextRecommendation, setNextRecommendation] = useState<LearningRecommendation | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { start: startQuestionTimer, elapsedMs: elapsedQuestionTimeMs } = useActiveQuestionTimer();
  const submittingRef = useRef(false);
  const startAttemptedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const finishRound = useCallback(async (
    activeStart: RetentionTestStart,
    completedAnswers: { question_id: number; answer: string; response_time_ms: number }[],
  ) => {
    const data = await api<{
      assessment: RetentionAssessment;
      completed_round_key: string;
      next_recommendation: LearningRecommendation;
    }>(`/retention-assessments/${assessment.assessment_id}/submit`, {
      method: "POST",
      body: JSON.stringify({ round_id: activeStart.round_id, answers: completedAnswers }),
    });
    setQuestions([]);
    setResult(data.assessment);
    setNextRecommendation(data.next_recommendation);
    setMessage("");
    setSubmitting(false);
    submittingRef.current = false;
    onCompleteRef.current(data.assessment);
  }, [assessment.assessment_id]);

  useEffect(() => {
    if (startAttemptedRef.current) return;
    startAttemptedRef.current = true;
    let cancelled = false;
    api<RetentionTestStart>(`/retention-assessments/${assessment.assessment_id}/start`, { method: "POST" })
      .then((data) => {
        if (cancelled) return;
        setStarted(data);
        setQuestions(data.questions);
        setAnswers(data.saved_answers);
        setIndex(data.saved_answers.length);
        setMessage("");
        if (data.saved_answers.length === data.questions.length) {
          setSubmitting(true);
          submittingRef.current = true;
          finishRound(data, data.saved_answers).catch((error) => {
            if (!cancelled) {
              setMessage(error instanceof Error ? error.message : "Your answers are saved. Finish the recall check when ready.");
              setSubmitting(false);
              submittingRef.current = false;
            }
          });
          return;
        }
        if (data.saved_answers.length > 0) setMessage(`Resumed at question ${data.saved_answers.length + 1}.`);
        startQuestionTimer();
        requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Could not start the recall check.");
      });
    return () => { cancelled = true; };
  }, [assessment.assessment_id, finishRound, startQuestionTimer]);

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
    const savedAnswer = {
      question_id: current.question_id,
      answer,
      response_time_ms: elapsedQuestionTimeMs(),
    };
    const nextAnswers = [
      ...answers,
      savedAnswer,
    ];
    setInput("");
    try {
      await api<{ saved: boolean }>(`/retention-assessments/${assessment.assessment_id}/answer`, {
        method: "POST",
        body: JSON.stringify({ round_id: started.round_id, ...savedAnswer }),
      });
      setAnswers(nextAnswers);
      setIndex((currentIndex) => currentIndex + 1);
    } catch (error) {
      setInput(answer);
      setMessage(error instanceof Error ? error.message : "Could not save that answer. Please try again.");
      setSubmitting(false);
      submittingRef.current = false;
      focusInput();
      return;
    }
    if (index + 1 < questions.length) {
      startQuestionTimer();
      setSubmitting(false);
      submittingRef.current = false;
      focusInput();
      return;
    }

    try {
      await finishRound(started, nextAnswers);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your answers are saved. Finish the recall check when ready.");
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
    if (questions.length > 0 && !window.confirm("Leave this recall check and go home? Saved answers will be here when you return.")) return;
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
      {!current && started && questions.length > 0 && answers.length === questions.length && !result && (
        <button type="button" className="startTestButton" disabled={submitting} onClick={() => {
          setSubmitting(true);
          submittingRef.current = true;
          finishRound(started, answers).catch((error) => {
            setMessage(error instanceof Error ? error.message : "Your answers are saved. Finish the recall check when ready.");
            setSubmitting(false);
            submittingRef.current = false;
          });
        }}>
          {submitting ? "Finishing..." : "Finish recall check"}
        </button>
      )}
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
          {nextRecommendation && <p className="nextLearningStep"><strong>Next focus:</strong> {nextRecommendation.message}</p>}
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
