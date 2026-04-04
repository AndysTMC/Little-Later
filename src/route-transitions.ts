export const entryTransitions = {
	none: {
		initial: { opacity: 1 },
		animate: { opacity: 1, transition: { duration: 0 } },
	},
	slideLeft: {
		initial: { opacity: 0, x: 100 },
		animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
	},
	slideRight: {
		initial: { opacity: 0, x: -100 },
		animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
	},
	slideUp: {
		initial: { opacity: 0, y: 100 },
		animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
	},
	slideDown: {
		initial: { opacity: 0, y: -100 },
		animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
	},
	slideUpToDown: {
		initial: { opacity: 1, y: "-100%" },
		animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
	},
	slideDownToUp: {
		initial: { opacity: 1, y: "100%" },
		animate: { opacity: 1, y: 0, transition: { duration: 0.3 } },
	},
	fade: {
		initial: { opacity: 0 },
		animate: { opacity: 1, transition: { duration: 0.3 } },
	},
	zoomIn: {
		initial: { opacity: 0, scale: 0.9 },
		animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
	},
	zoomOut: {
		initial: { opacity: 0, scale: 1.1 },
		animate: { opacity: 1, scale: 1, transition: { duration: 0.3 } },
	},
	test: {
		initial: { opacity: 0, scale: 0 },
		animate: {
			opacity: 1,
			scale: 1,
			transition: { duration: 1, delay: 2 },
		},
	},
};

export const exitTransitions = {
	none: {},
	slideLeft: {
		exit: { opacity: 0, x: -100, transition: { duration: 0.3 } },
	},
	slideRight: {
		exit: { opacity: 0, x: 100, transition: { duration: 0.3 } },
	},
	slideUp: {
		exit: { opacity: 0, y: -100, transition: { duration: 0.3 } },
	},
	slideDown: {
		exit: { opacity: 0, y: 100, transition: { duration: 0.3 } },
	},
	slideUpToDown: {
		exit: { opacity: 0, y: "100%", transition: { duration: 0.3 } },
	},
	slideDownToUp: {
		exit: { opacity: 0, y: "-100%", transition: { duration: 0.3 } },
	},
	fade: {
		exit: { opacity: 0, transition: { duration: 0.3 } },
	},
	zoomIn: {
		exit: { opacity: 0, scale: 1.1, transition: { duration: 0.3 } },
	},
	zoomOut: {
		exit: { opacity: 0, scale: 0.9, transition: { duration: 0.3 } },
	},
	test: {
		exit: { opacity: 0, scale: 0, transition: { duration: 1, delay: 2 } },
	},
};
