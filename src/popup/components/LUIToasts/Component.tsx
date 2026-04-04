import { useTheme } from "../../hooks/useTheme";
import { useToasts } from "../../hooks/useToasts";
import { LUIToast } from "../LUIToast/Component";
import { useEffect, useRef, useState } from "react";
import { deleteToast } from "../../../services/toasts";
import { fakeWait } from "little-shared/utils/misc";
import { AnimatePresence, motion } from "framer-motion";

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

	useEffect(() => {
		const baseDelay = 3000;
		const stagger = 900;
		const exitDuration = 300;

		const list = [...toasts];

		list.forEach((toast, index) => {
			if (scheduledRef.current.has(toast.id)) return;

			const delay = baseDelay + index * stagger;
			const timer = window.setTimeout(async () => {
				setClosingIds((prev) => {
					const next = new Set(prev);
					next.add(toast.id);
					return next;
				});
				await fakeWait({ waitPeriod: exitDuration });
				await deleteToast(toast.id);

				scheduledRef.current.delete(toast.id);
				timersRef.current.delete(toast.id);
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
		return () => {
			timersRef.current.forEach((t) => clearTimeout(t));
			timersRef.current.clear();
			scheduledRef.current.clear();
		};
	}, []);

	return (
		<div className="absolute bottom-4 left-1/2 z-50 max-h-full w-max -translate-x-1/2 transform">
			<AnimatePresence mode="sync">
				{toasts.map(
					(toast) =>
						!closingIds.has(toast.id) && (
							<motion.div
								key={toast.id}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 20 }}
								transition={{ duration: 0.3 }}
								className="mb-2 h-max w-max"
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
