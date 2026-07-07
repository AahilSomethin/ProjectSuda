import { useEffect, useState } from "react";

const CHAR_DELAY_MS = 16;

function getPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriterText(
  fullText: string,
  enabled: boolean,
): { displayedText: string; isTyping: boolean; reducedMotion: boolean } {
  const [displayedText, setDisplayedText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setDisplayedText(fullText);
      setIsTyping(false);
      return;
    }

    setDisplayedText("");
    setIsTyping(true);

    let index = 0;
    const intervalId = window.setInterval(() => {
      index += 1;
      setDisplayedText(fullText.slice(0, index));

      if (index >= fullText.length) {
        window.clearInterval(intervalId);
        setIsTyping(false);
      }
    }, CHAR_DELAY_MS);

    return () => window.clearInterval(intervalId);
  }, [fullText, enabled, reducedMotion]);

  return { displayedText, isTyping, reducedMotion };
}
