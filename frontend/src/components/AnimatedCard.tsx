import { m } from "framer-motion";
import type { ReactNode } from "react";
import { MotionWrapper } from "./MotionWrapper";

interface AnimatedCardProps {
	children: ReactNode;
	delay?: number;
}

/**
 * Simple animated card component demonstrating Framer Motion setup.
 * Fades in and slides up on mount.
 */
export function AnimatedCard({ children, delay = 0 }: AnimatedCardProps) {
	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					duration: 0.5,
					delay,
					ease: "easeOut",
				}}
				className="rounded-lg border border-neutral-200 bg-white p-6 shadow-md"
			>
				{children}
			</m.div>
		</MotionWrapper>
	);
}
