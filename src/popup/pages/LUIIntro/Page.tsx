import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { entryTransitions, exitTransitions } from "../../../route-transitions";
import { useLittleTransition } from "../../hooks/useLittleTransition";
import { useEffect, useState } from "react";
import { useCurrentUserProfile } from "../../hooks/useCurrentUserProfile";

const Page = () => {
	const navigate = useNavigate();
	const currentUserProfile = useCurrentUserProfile();

	const [isVideoEnded, setIsVideoEnded] = useState(false);

	useEffect(() => {
		if (currentUserProfile) {
			navigate("/home", {
				replace: true,
				state: {
					entryTransition: entryTransitions.zoomIn,
				},
			});
		} else if (isVideoEnded) {
			navigate("/browse-profiles", {
				state: { entryTransition: entryTransitions.slideLeft },
			});
		}
	}, [navigate, currentUserProfile, isVideoEnded]);

	const { entry, exit } = useLittleTransition({
		defaultExit: exitTransitions.slideLeft,
	});

	const handleVideoEnd = () => {
		setIsVideoEnded(true);
	};
	return (
		<motion.div
			className={`flex h-full w-full flex-col items-center justify-center bg-white`}
			{...entry}
			{...exit}
		>
			<motion.div className={`h-max w-max`} exit={{ opacity: 0 }}>
				<video
					src="/videos/little-later-animation.mp4"
					autoPlay
					muted
					onEnded={handleVideoEnd}
					className="h-56 w-56 object-cover"
				/>
			</motion.div>
			<div className="flex items-center justify-center gap-x-5">
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
					className={`text-5xl font-extrabold`}
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
					className={`text-5xl font-extrabold`}
				>
					Later
				</motion.div>
			</div>
		</motion.div>
	);
};

export { Page as LUIIntro };
