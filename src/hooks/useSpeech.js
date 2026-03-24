import { useState, useEffect, useRef, useCallback } from "react";

function getVoices() {
  return new Promise(resolve => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) { resolve(voices); return; }
    const handler = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", handler, { once: true });
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 2000);
  });
}

function pickBestVoice(voices) {
  const en = voices.filter(v => v.lang.startsWith("en"));
  const natural = en.find(v => /natural|enhanced/i.test(v.name));
  if (natural) return natural;
  const google = en.find(v => /google us english/i.test(v.name));
  if (google) return google;
  const usEn = en.find(v => v.lang === "en-US");
  return usEn || en[0] || null;
}

function stripMarkdown(text) {
  return (text || "")
    .replace(/\*\*/g, "").replace(/\*/g, "").replace(/#/g, "")
    .replace(/_{1,2}(.*?)_{1,2}/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/`/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, " ")
    .trim();
}

// Global singleton to ensure only one voice plays at a time
const globalState = { activeId: null, cancel: null };

export function useSpeech(id) {
  const [state, setState] = useState("idle"); // idle | playing | paused | done
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const utteranceRef = useRef(null);
  const sentencesRef = useRef([]);
  const sentenceIdxRef = useRef(0);
  const doneTimerRef = useRef(null);

  const stopSelf = useCallback(() => {
    window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setState("idle");
    setProgress({ current: 0, total: 0 });
    if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
  }, []);

  // Register cancel fn globally
  useEffect(() => {
    return () => {
      if (globalState.activeId === id) {
        globalState.activeId = null;
        globalState.cancel = null;
      }
      if (doneTimerRef.current) clearTimeout(doneTimerRef.current);
    };
  }, [id]);

  const play = useCallback(async (text) => {
    // Stop any other playing voice
    if (globalState.activeId && globalState.activeId !== id) {
      globalState.cancel?.();
    }

    const clean = stripMarkdown(text);
    const sentences = clean.match(/[^.!?]+[.!?]*/g)?.filter(s => s.trim().length > 3) || [clean];
    sentencesRef.current = sentences;
    sentenceIdxRef.current = 0;
    const total = sentences.length;
    setProgress({ current: 1, total });

    const voices = await getVoices();
    const voice = pickBestVoice(voices);

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.9;
    u.pitch = 1.0;
    u.volume = 1.0;
    if (voice) u.voice = voice;

    u.onboundary = (e) => {
      if (e.name === "sentence") {
        sentenceIdxRef.current = Math.min(sentenceIdxRef.current + 1, total - 1);
        setProgress({ current: sentenceIdxRef.current + 1, total });
      }
    };

    u.onend = () => {
      setState("done");
      setProgress({ current: total, total });
      globalState.activeId = null;
      globalState.cancel = null;
      doneTimerRef.current = setTimeout(() => {
        setState("idle");
        setProgress({ current: 0, total: 0 });
      }, 3000);
    };

    u.onerror = () => {
      setState("idle");
      setProgress({ current: 0, total: 0 });
    };

    utteranceRef.current = u;
    globalState.activeId = id;
    globalState.cancel = stopSelf;

    window.speechSynthesis.speak(u);
    setState("playing");
  }, [id, stopSelf]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setState("paused");
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setState("playing");
  }, []);

  const cancel = useCallback(() => {
    stopSelf();
    if (globalState.activeId === id) {
      globalState.activeId = null;
      globalState.cancel = null;
    }
  }, [id, stopSelf]);

  return { state, progress, play, pause, resume, cancel };
}

export function cancelAllSpeech() {
  window.speechSynthesis.cancel();
  globalState.activeId = null;
  globalState.cancel = null;
}