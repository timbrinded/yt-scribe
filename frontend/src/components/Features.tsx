import { m } from "framer-motion";
import type { ReactNode } from "react";
import { MotionWrapper } from "./MotionWrapper";

interface Feature {
	title: string;
	description: string;
	icon: "transcribe" | "search" | "chat";
}

const defaultFeatures: Feature[] = [
	{
		title: "Transcribe",
		description:
			"Automatically transcribe any YouTube video with AI-powered speech recognition. Get accurate timestamps for every word.",
		icon: "transcribe",
	},
	{
		title: "Search",
		description:
			"Search through your entire video library instantly. Find specific moments, quotes, or topics in seconds.",
		icon: "search",
	},
	{
		title: "Chat",
		description:
			"Ask questions about your videos and get intelligent answers with timestamp citations. Like having a conversation with the content.",
		icon: "chat",
	},
];

const icons: Record<Feature["icon"], ReactNode> = {
	transcribe: (
		<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
			/>
		</svg>
	),
	search: (
		<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
			/>
		</svg>
	),
	chat: (
		<svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
			<path
				strokeLinecap="round"
				strokeLinejoin="round"
				d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
			/>
		</svg>
	),
};

interface FeaturesProps {
	features?: Feature[];
}

export function Features({ features = defaultFeatures }: FeaturesProps) {
	return (
		<MotionWrapper>
			<section id="features" className="relative px-4 py-24">
				<div className="mx-auto max-w-6xl">
					{/* Section header */}
					<m.div
						initial={{ opacity: 0, y: 20 }}
						whileInView={{ opacity: 1, y: 0 }}
						viewport={{ once: true, margin: "-100px" }}
						transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
						className="mb-16 text-center"
					>
						<h2 className="text-3xl font-bold text-neutral-900 sm:text-4xl">
							Everything you need
						</h2>
						<p className="mx-auto mt-4 max-w-2xl text-lg text-neutral-600">
							A complete toolkit for turning videos into actionable knowledge
						</p>
					</m.div>

					{/* Feature cards */}
					<div className="grid gap-8 md:grid-cols-3">
						{features.map((feature, index) => (
							<m.div
								key={feature.title}
								initial={{ opacity: 0, y: 40 }}
								whileInView={{ opacity: 1, y: 0 }}
								viewport={{ once: true, margin: "-100px" }}
								transition={{
									duration: 0.6,
									delay: index * 0.15,
									ease: [0.22, 1, 0.36, 1],
								}}
								className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-500/10"
							>
								{/* Icon */}
								<div className="mb-6 inline-flex rounded-xl bg-primary-50 p-3 text-primary-600 transition-colors duration-300 group-hover:bg-primary-100">
									{icons[feature.icon]}
								</div>

								{/* Content */}
								<h3 className="mb-3 text-xl font-semibold text-neutral-900">
									{feature.title}
								</h3>
								<p className="text-neutral-600 leading-relaxed">
									{feature.description}
								</p>

								{/* Decorative gradient on hover */}
								<div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-50/0 via-primary-50/0 to-accent-50/0 transition-all duration-500 group-hover:from-primary-50/50 group-hover:via-primary-50/30 group-hover:to-accent-50/50" />
							</m.div>
						))}
					</div>
				</div>
			</section>
		</MotionWrapper>
	);
}
