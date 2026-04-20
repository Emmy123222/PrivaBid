import { useEffect, useRef, useState } from "react";

export function useRevealOnScroll<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.1,
  rootMargin = "0px 0px -48px 0px",
) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            break;
          }
        }
      },
      { threshold, rootMargin },
    );

    io.observe(el);
    return () => io.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible };
}
