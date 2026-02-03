import { m } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

interface HeroProps {
	title?: string;
	subtitle?: string;
	primaryCta?: {
		text: string;
		href: string;
	};
	secondaryCta?: {
		text: string;
		href: string;
	};
}

export function Hero({
	title = "Transform YouTube into Knowledge",
	subtitle = "YTScribe transcribes your favorite videos and lets you chat with the content using AI. Never lose an insight again.",
	primaryCta = { text: "Get Started", href: "/login" },
	secondaryCta = { text: "Learn More", href: "#features" },
}: HeroProps) {
	return (
		<MotionWrapper>
			<m.section
				className="relative flex min-h-[85vh] flex-col items-center justify-center px-4 py-20 text-center"
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.6, ease: "easeOut" }}
			>
				{/* Decorative badge */}
				<m.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
					className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/80 px-4 py-2 text-sm font-medium text-primary-700 shadow-sm backdrop-blur-sm"
				>
					<span className="flex h-2 w-2 rounded-full bg-primary-500">
						<span className="inline-flex h-2 w-2 animate-ping rounded-full bg-primary-400 opacity-75"></span>
					</span>
					AI-Powered Video Intelligence
				</m.div>

				{/* Main headline */}
				<m.h1
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
					className="mx-auto max-w-4xl text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl md:text-6xl lg:text-7xl"
				>
					<span className="block">{title.split(" ").slice(0, 2).join(" ")}</span>
					<span className="mt-2 block bg-gradient-to-r from-primary-600 via-primary-500 to-accent-500 bg-clip-text text-transparent">
						{title.split(" ").slice(2).join(" ")}
					</span>
				</m.h1>

				{/* Subtitle */}
				<m.p
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
					className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600 sm:text-xl"
				>
					{subtitle}
				</m.p>

				{/* CTA Buttons */}
				<m.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.5, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
					className="mt-10 flex flex-col items-center gap-4 sm:flex-row"
				>
					<a
						href={primaryCta.href}
						className="group inline-flex items-center gap-2 rounded-xl bg-primary-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-primary-500/25 transition-all duration-200 hover:bg-primary-700 hover:shadow-xl hover:shadow-primary-500/30"
					>
						{primaryCta.text}
						<svg
							className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
						</svg>
					</a>
					<a
						href={secondaryCta.href}
						className="inline-flex items-center gap-2 rounded-xl border-2 border-neutral-200 bg-white/80 px-8 py-4 text-lg font-semibold text-neutral-700 backdrop-blur-sm transition-all duration-200 hover:border-neutral-300 hover:bg-white hover:text-neutral-900"
					>
						{secondaryCta.text}
					</a>
				</m.div>

				{/* Scroll indicator */}
				<m.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.6, delay: 0.7, ease: [0.22, 1, 0.36, 1] }}
					className="absolute bottom-8 left-1/2 -translate-x-1/2"
				>
					<m.div
						animate={{ y: [0, 8, 0] }}
						transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
						className="flex flex-col items-center gap-2 text-neutral-400"
					>
						<span className="text-xs font-medium uppercase tracking-wider">Scroll</span>
						<svg
							className="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
						</svg>
					</m.div>
				</m.div>
			</m.section>
		</MotionWrapper>
	);
}
