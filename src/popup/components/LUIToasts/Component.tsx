import { useTheme } from "../../hooks/useTheme";
import { useToasts } from "../../hooks/useToasts";
import { LUIToast } from "../LUIToast/Component";
import { useEffect, useRef, useState } from "react";
import { deleteToast } from "../../../services/toasts";
import { fakeWait } from "little-shared/utils/misc";
import { AnimatePresence, motion } from "framer-motion";
import { MOTION } from "../../../route-transitions";

const Component = () => {
	const { theme } = useTheme();
	const toasts = useToasts();

	// IDs currently exiting (so we can animate them out)
	const [closingIds, setClosingIds] = useState<Set<string | number>>(
		new Set(),
	);

	// Track which IDs already have a scheduled auto-close
	const scheduledRef = useRef<Set<string | number>>(new Set());
	const timersRef = useRef<Map<string | number, number>>(new Map());
	const mountedRef = useRef(true);

	useEffect(() => {
		const baseDelay = 3000;
		const stagger = 900;
		const exitDuration = 200;

		const list = [...toasts];

		list.forEach((toast, index) => {
			if (scheduledRef.current.has(toast.id)) return;

			const delay = baseDelay + index * stagger;
			const timer = window.setTimeout(async () => {
				if (!mountedRef.current) return;
				setClosingIds((prev) => {
					const next = new Set(prev);
					next.add(toast.id);
					return next;
				});
				await fakeWait({ waitPeriod: exitDuration });
				try {
					await deleteToast(toast.id);
				} catch (error) {
					console.warn("Could not dismiss toast.", error);
				}

				scheduledRef.current.delete(toast.id);
				timersRef.current.delete(toast.id);
				if (!mountedRef.current) return;
				setClosingIds((prev) => {
					if (!prev.has(toast.id)) return prev;
					const next = new Set(prev);
					next.delete(toast.id);
					return next;
				});
			}, delay);

			scheduledRef.current.add(toast.id);
			timersRef.current.set(toast.id, timer);
		});
	}, [toasts]);

	useEffect(() => {
		mountedRef.current = true;
		const timers = timersRef.current;
		const scheduled = scheduledRef.current;
		return () => {
			mountedRef.current = false;
			timers.forEach((t) => clearTimeout(t));
			timers.clear();
			scheduled.clear();
		};
	}, []);

	return (
		<div className="pointer-events-none absolute bottom-4 left-1/2 z-50 max-h-full w-max -translate-x-1/2 transform">
			<AnimatePresence mode="sync">
				{toasts.map(
					(toast) =>
						!closingIds.has(toast.id) && (
							<motion.div
								key={toast.id}
								layout
								initial={{ opacity: 0, y: 12, scale: 0.98 }}
								animate={{
									opacity: 1,
									y: 0,
									scale: 1,
									transition: MOTION.toastEnter,
								}}
								exit={{
									opacity: 0,
									y: 10,
									scale: 0.98,
									transition: MOTION.toastExit,
								}}
								className="pointer-events-auto mb-2 h-max w-max"
							>
								<LUIToast theme={theme} toast={toast} />
							</motion.div>
						),
				)}
			</AnimatePresence>
		</div>
	);
};

export { Component as LUIToasts };
