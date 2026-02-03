import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

interface MotionWrapperProps {
	children: ReactNode;
}

/**
 * Wrapper component that lazily loads Framer Motion features.
 * Uses domAnimation for a smaller bundle size (~17kb vs ~45kb).
 * Wrap animated components with this to enable animations.
 */
export function MotionWrapper({ children }: MotionWrapperProps) {
	return (
		<LazyMotion features={domAnimation} strict>
			{children}
		</LazyMotion>
	);
}
