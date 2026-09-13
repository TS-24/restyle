import type { ReactNode } from "react";
import { motion } from "framer-motion";

import { NOTE_LAYOUT_TRANSITION } from "~/workspace/note-surface";

/**
 * The empty card that starts something — a note, or a conversation.
 *
 * One component rather than two similar ones, because "the same in layout and
 * design, different only in colour" is a requirement rather than a coincidence.
 * Two copies would agree on the day they were written and drift by the second
 * time either is touched; here the geometry has one definition and `tone` is
 * the only axis that varies.
 */

export type GhostTone = "accent" | "ink";

/**
 * Both tones are existing palette tokens (DESIGN.md §4) — the accent is the app's
 * accent, ink is its type colour. No third hue is introduced: a new one would
 * need a place in the ramp and a dark-mode counterpart, and the two the theme
 * already has are as distinguishable as anything invented would be.
 */
const TONE: Record<GhostTone, string> = {
  accent: "border-hairline text-accent-ink hover:border-accent-ink/60 hover:bg-paper-raised/60",
  ink: "border-ink/25 text-ink/70 hover:border-ink/50 hover:bg-paper-raised/60",
};

export default function GhostCard({
  tone,
  label,
  icon,
  layoutId,
  onClick,
}: {
  tone: GhostTone;
  /** The tooltip and the accessible name. The card itself shows only the icon. */
  label: string;
  icon: ReactNode;
  /** Set only for the note ghost, which morphs into the note it creates. */
  layoutId?: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      layoutId={layoutId}
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{ borderRadius: 16 }}
      transition={{ layout: NOTE_LAYOUT_TRANSITION }}
      className={`flex min-h-[104px] w-full items-center justify-center border-2 border-dashed cursor-pointer transition-colors ${TONE[tone]}`}
    >
      {icon}
    </motion.button>
  );
}
