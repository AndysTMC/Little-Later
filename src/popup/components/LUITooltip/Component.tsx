import {
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { LTHEME } from "little-shared/enums";
import { twMerge } from "tailwind-merge";
import { useTheme } from "../../hooks/useTheme";

/** Default hover intent delay (ms) so casual cursor sweeps never trigger tooltip noise. */
export const TOOLTIP_OPEN_DELAY_MS = 350;

/** Brief close grace period (ms) to absorb minor pointer jitter. */
export const TOOLTIP_CLOSE_DELAY_MS = 80;

const VIEWPORT_MARGIN_PX = 8;
const ANCHOR_OFFSET_PX = 6;
const INTERACTIVE_SELECTOR =
	'button, a[href], input, select, textarea, [role="button"], [role="tab"], [tabindex]';

export type TooltipPlacement = "top" | "bottom";

/**
 * Accessible, viewport-safe tooltip primitive (docs/design.md, Tooltips).
 *
 * Interaction design:
 * - Hover opens after `delayMs` (default 350ms) so pointer sweeps stay calm.
 * - Keyboard focus opens immediately so keyboard and screen-reader users get
 *   instant feedback without waiting.
 * - Pointer press, click, Escape, scroll, or blur dismiss immediately.
 * - Portal-rendered in `document.body` and clamped to viewport edges so cards
 *   and narrow side panels (~320px) never clip the label.
 * - Works on both interactive and `disabled` buttons via its lightweight
 *   wrapper span, while linking `aria-describedby` directly to the inner
 *   control when visible.
 */
const Component = ({
	content,
	shortcut,
	placement = "top",
	delayMs = TOOLTIP_OPEN_DELAY_MS,
	disabled = false,
	triggerClassName,
	triggerRole,
	className,
	children,
}: {
	/** Concise label shown inside the tooltip. */
	content: string;
	/** Optional compact keyboard shortcut badge (e.g. "Esc"). */
	shortcut?: string;
	/** Preferred vertical placement; auto-flips if clipped by the viewport. */
	placement?: TooltipPlacement;
	/** Hover open delay in milliseconds. Defaults to 350ms. */
	delayMs?: number;
	/** Suppresses the tooltip completely (e.g. when a label is already visible). */
	disabled?: boolean;
	/** Optional class names merged onto the inline-flex trigger wrapper. */
	triggerClassName?: string;
	/** Optional ARIA role for the wrapper span (e.g. `"none"` inside a `tablist`). */
	triggerRole?: "none" | "presentation";
	className?: string;
	children: ReactNode;
}) => {
	const { theme } = useTheme();
	const isDark = theme === LTHEME.DARK;
	const tooltipId = useId();
	const [open, setOpen] = useState(false);

	const wrapperRef = useRef<HTMLSpanElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearTimers = useCallback(() => {
		if (openTimerRef.current !== null) {
			clearTimeout(openTimerRef.current);
			openTimerRef.current = null;
		}
		if (closeTimerRef.current !== null) {
			clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
	}, []);

	const hideImmediately = useCallback(() => {
		clearTimers();
		setOpen(false);
	}, [clearTimers]);

	const scheduleOpen = useCallback(
		(immediate: boolean) => {
			clearTimers();
			if (immediate || delayMs <= 0) {
				setOpen(true);
				return;
			}
			openTimerRef.current = setTimeout(() => {
				openTimerRef.current = null;
				if (wrapperRef.current?.isConnected) {
					setOpen(true);
				}
			}, delayMs);
		},
		[clearTimers, delayMs],
	);

	const scheduleClose = useCallback(() => {
		clearTimers();
		closeTimerRef.current = setTimeout(() => {
			closeTimerRef.current = null;
			setOpen(false);
		}, TOOLTIP_CLOSE_DELAY_MS);
	}, [clearTimers]);

	const isSuppressed = disabled || content.trim() === "";
	const isVisible = open && !isSuppressed;

	useEffect(() => {
		return () => clearTimers();
	}, [clearTimers]);

	useEffect(() => {
		if (!isVisible) return;
		const wrapper = wrapperRef.current;
		const describedTarget =
			wrapper?.querySelector<HTMLElement>(INTERACTIVE_SELECTOR) ??
			wrapper;
		if (describedTarget) {
			const existing = describedTarget
				.getAttribute("aria-describedby")
				?.split(/\s+/)
				.filter(Boolean);
			const tokens = existing ? [...existing] : [];
			if (!tokens.includes(tooltipId)) {
				tokens.push(tooltipId);
				describedTarget.setAttribute(
					"aria-describedby",
					tokens.join(" "),
				);
			}
		}

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				hideImmediately();
			}
		};
		const onDismiss = () => hideImmediately();
		window.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("scroll", onDismiss, true);
		window.addEventListener("resize", onDismiss);
		return () => {
			if (describedTarget) {
				const remaining = (
					describedTarget.getAttribute("aria-describedby") ?? ""
				)
					.split(/\s+/)
					.filter((token) => token !== "" && token !== tooltipId);
				if (remaining.length > 0) {
					describedTarget.setAttribute(
						"aria-describedby",
						remaining.join(" "),
					);
				} else {
					describedTarget.removeAttribute("aria-describedby");
				}
			}
			window.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("scroll", onDismiss, true);
			window.removeEventListener("resize", onDismiss);
		};
	}, [isVisible, tooltipId, hideImmediately]);

	useLayoutEffect(() => {
		if (!isVisible) return;
		const anchor = wrapperRef.current;
		const tip = tooltipRef.current;
		if (!anchor || !tip) return;

		const anchorRect = anchor.getBoundingClientRect();
		const tipRect = tip.getBoundingClientRect();
		const vw = window.innerWidth || 500;
		const vh = window.innerHeight || 600;

		let top =
			placement === "top"
				? anchorRect.top - tipRect.height - ANCHOR_OFFSET_PX
				: anchorRect.bottom + ANCHOR_OFFSET_PX;

		if (placement === "top" && top < VIEWPORT_MARGIN_PX) {
			const flipped = anchorRect.bottom + ANCHOR_OFFSET_PX;
			if (flipped + tipRect.height <= vh - VIEWPORT_MARGIN_PX) {
				top = flipped;
			}
		} else if (
			placement === "bottom" &&
			top + tipRect.height > vh - VIEWPORT_MARGIN_PX
		) {
			const flipped = anchorRect.top - tipRect.height - ANCHOR_OFFSET_PX;
			if (flipped >= VIEWPORT_MARGIN_PX) {
				top = flipped;
			}
		}

		top = Math.max(
			VIEWPORT_MARGIN_PX,
			Math.min(top, vh - tipRect.height - VIEWPORT_MARGIN_PX),
		);

		const idealLeft =
			anchorRect.left + anchorRect.width / 2 - tipRect.width / 2;
		const maxLeft = Math.max(
			VIEWPORT_MARGIN_PX,
			vw - tipRect.width - VIEWPORT_MARGIN_PX,
		);
		const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(idealLeft, maxLeft));

		tip.style.top = `${Math.round(top)}px`;
		tip.style.left = `${Math.round(left)}px`;
		tip.style.opacity = "1";
	}, [isVisible, placement, content, shortcut]);

	if (isSuppressed) {
		return <>{children}</>;
	}

	const handleMouseEnter = () => {
		scheduleOpen(false);
	};
	const handleFocus = () => {
		scheduleOpen(true);
	};

	const portal =
		isVisible && typeof document !== "undefined"
			? createPortal(
					<div
						ref={tooltipRef}
						id={tooltipId}
						role="tooltip"
						style={{ opacity: 0, top: 0, left: 0 }}
						className={twMerge(
							`pointer-events-none fixed z-50 flex max-w-56 items-center gap-x-1.5 rounded-lg border px-2 py-1 text-[11px] leading-tight font-medium shadow-lg transition-opacity duration-150 ${
								isDark
									? "border-neutral-700 bg-neutral-800 text-neutral-100"
									: "border-neutral-800 bg-neutral-900 text-white"
							}`,
							className,
						)}
					>
						<span className="truncate">{content}</span>
						{shortcut ? (
							<kbd
								className={`rounded px-1 py-0.5 font-mono text-[10px] leading-none ${
									isDark
										? "bg-neutral-900 text-neutral-300"
										: "bg-neutral-800 text-neutral-300"
								}`}
							>
								{shortcut}
							</kbd>
						) : null}
					</div>,
					document.body,
				)
			: null;

	return (
		<>
			<span
				ref={wrapperRef}
				role={triggerRole}
				className={twMerge(
					"inline-flex items-center",
					triggerClassName,
				)}
				onMouseEnter={handleMouseEnter}
				onMouseLeave={scheduleClose}
				onFocus={handleFocus}
				onBlur={hideImmediately}
				onPointerDown={hideImmediately}
				onClick={hideImmediately}
			>
				{children}
			</span>
			{portal}
		</>
	);
};

export { Component as LUITooltip };
