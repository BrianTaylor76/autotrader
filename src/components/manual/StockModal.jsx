import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import ResearchPanel from "./ResearchPanel";
import { cancelAllSpeech } from "@/hooks/useSpeech";

export default function StockModal({ stock, savedResearch, onClose }) {
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const touchStartY = useRef(null);
  const [visible, setVisible] = useState(false);

  // Animate in
  useEffect(() => {
    if (stock) {
      requestAnimationFrame(() => setVisible(true));
    }
  }, [stock]);

  // Lock body scroll
  useEffect(() => {
    if (stock) {
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [stock]);

  // Swipe down to close (mobile)
  function handleTouchStart(e) {
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta > 80) handleClose();
    touchStartY.current = null;
  }

  function handleClose() {
    cancelAllSpeech();
    setVisible(false);
    setTimeout(onClose, 300);
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) handleClose();
  }

  if (!stock) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: visible ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0)", transition: "background-color 0.3s ease" }}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative bg-background flex flex-col
          w-full h-[95vh] rounded-t-2xl
          md:w-[80vw] md:h-[90vh] md:rounded-2xl md:mx-auto"
        style={{
          transform: visible
            ? "translateY(0) scale(1)"
            : "translateY(100%) scale(0.98)",
          opacity: visible ? 1 : 0,
          transition: "transform 0.3s cubic-bezier(0.32,0.72,0,1), opacity 0.3s ease",
        }}
      >
        {/* Drag handle (mobile) */}
        <div className="md:hidden flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 md:top-4 md:right-4 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-secondary hover:bg-accent transition-colors"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6 md:px-6 md:pt-4">
          <ResearchPanel stock={stock} savedResearch={savedResearch} isModal />
        </div>
      </div>
    </div>
  );
}