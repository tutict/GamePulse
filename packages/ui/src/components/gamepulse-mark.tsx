import { useId, type SVGProps } from "react";

export interface GamePulseMarkProps extends Omit<SVGProps<SVGSVGElement>, "title"> {
  /** Visible title for standalone use; omit for decorative marks. */
  title?: string;
}

/**
 * 游脉窗 mark: an open evidence window with a single sentiment pulse crossing it.
 */
export function GamePulseMark({ title, ...props }: GamePulseMarkProps) {
  const generatedId = useId();
  const titleId = title ? `gamepulse-mark-title-${generatedId.replace(/:/g, "")}` : undefined;

  return (
    <svg
      aria-hidden={title ? undefined : true}
      aria-labelledby={titleId}
      fill="none"
      role={title ? "img" : undefined}
      viewBox="0 0 48 48"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      <path
        d="M17 10H34a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4V17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <path
        d="M10 17v-1a6 6 0 0 1 6-6h1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <path
        d="M13 25h6l3-7 5 14 4-7h7"
        stroke="var(--gp-mark-accent, #3D8B82)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.5"
      />
      <circle cx="13" cy="25" fill="var(--gp-mark-accent, #3D8B82)" r="2.25" />
    </svg>
  );
}
