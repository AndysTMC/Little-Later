import { motion } from "framer-motion";
import { useMoveNavigate, usePageMotion } from "../../hooks/usePageMove";
import { useEffect, useRef, useState } from "react";
import { useResolvedCurrentUser } from "../../hooks/useCurrentUserProfile";

const Page = () => {
	const go = useMoveNavigate();
	const { isResolved, profile: currentUserProfile } =
		useResolvedCurrentUser();

	const [isVideoEnded, setIsVideoEnded] = useState(false);

	// The intro leaves once, and only from its own route. It stays mounted
	// while it animates out, and the profile can arrive after the popup
	// has already gone somewhere else: redirecting then sent the popup to
	// Home over whatever had just been opened. The address bar is asked,
	// because this page's own location is frozen while it animates out.
	const hasLeft = useRef(false);

	useEffect(() => {
		if (hasLeft.current) {
			return;
		}
		if (!["", "#", "#/"].includes(window.location.hash)) {
			hasLeft.current = true;
			return;
		}
		if (currentUserProfile) {
			hasLeft.current = true;
			go("/home", "into", { replace: true });
		} else if (isVideoEnded) {
			hasLeft.current = true;
			go("/browse-profiles", "forward");
		}
	}, [go, currentUserProfile, isVideoEnded]);

	const pageMotion = usePageMotion();

	// Nothing is drawn until it is known whether a profile is unlocked:
	// the popup always opens here, and an unlocked profile goes straight
	// to Home without the intro showing first.
	if (!isResolved || currentUserProfile) {
		return <motion.div className="h-full w-full" {...pageMotion} />;
	}

	const handleVideoEnd = () => {
		setIsVideoEnded(true);
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col items-center justify-center bg-white`}
			{...pageMotion}
		>
			<motion.div className={`h-max w-max`} exit={{ opacity: 0 }}>
				<video
					src="/videos/little-later-animation.mp4"
					autoPlay
					muted
					playsInline
					onEnded={handleVideoEnd}
					onError={handleVideoEnd}
					className="h-56 w-56 object-cover"
				/>
			</motion.div>
			<div className="flex items-center justify-center gap-x-4">
				<motion.div
					initial={{
						opacity: 0,
						transform: "translateY(-50px)",
						color: "transparent",
					}}
					animate={{
						transform: "translateY(0px)",
						opacity: 1,
						color: "black",
					}}
					transition={{
						duration: 1,
						delay: 0.5,
						type: "spring",
					}}
					className="text-4xl font-extrabold tracking-tight sm:text-5xl"
				>
					Little
				</motion.div>
				<motion.div
					initial={{
						opacity: 0,
						transform: "translatex(-50px)",
						color: "transparent",
					}}
					animate={{
						transform: "translateX(0px)",
						opacity: 1,
						color: "black",
					}}
					transition={{
						duration: 1,
						delay: 1.5,
						type: "spring",
					}}
					className="text-4xl font-extrabold tracking-tight sm:text-5xl"
				>
					Later
				</motion.div>
			</div>
			<button
				type="button"
				// The same Skip as Getting Started's; the intro is always light.
				className="mt-8 flex h-9 cursor-pointer items-center justify-center rounded-xl bg-neutral-200 px-4 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-300 active:scale-[0.98]"
				onClick={handleVideoEnd}
			>
				Skip intro
			</button>
		</motion.div>
	);
};

export { Page as LUIIntro };
