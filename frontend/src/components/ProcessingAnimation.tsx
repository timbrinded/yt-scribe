import { m, AnimatePresence } from "framer-motion";
import { MotionWrapper } from "./MotionWrapper";

/**
 * Processing stages for the video pipeline
 */
export type ProcessingStage =
	| "idle"
	| "downloading"
	| "extracting"
	| "transcribing"
	| "complete"
	| "error";

interface ProcessingAnimationProps {
	/** Current stage of the processing pipeline */
	currentStage: ProcessingStage;
	/** Optional progress percentage (0-100) for the current stage */
	progress?: number;
	/** Optional error message to display when stage is 'error' */
	errorMessage?: string;
	/** Optional class name for custom styling */
	className?: string;
}

interface StageConfig {
	label: string;
	description: string;
	icon: React.ReactNode;
}

const stageConfigs: Record<Exclude<ProcessingStage, "idle" | "error">, StageConfig> = {
	downloading: {
		label: "Downloading",
		description: "Fetching video from YouTube...",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
			</svg>
		),
	},
	extracting: {
		label: "Extracting Audio",
		description: "Processing audio track...",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
			</svg>
		),
	},
	transcribing: {
		label: "Transcribing",
		description: "Converting speech to text with AI...",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
			</svg>
		),
	},
	complete: {
		label: "Complete",
		description: "Your video is ready to explore!",
		icon: (
			<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
				<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
			</svg>
		),
	},
};

const stageOrder: Exclude<ProcessingStage, "idle" | "error">[] = [
	"downloading",
	"extracting",
	"transcribing",
	"complete",
];

function getStageIndex(stage: ProcessingStage): number {
	if (stage === "idle" || stage === "error") return -1;
	return stageOrder.indexOf(stage);
}

/**
 * Spinner component for active stages
 */
function Spinner() {
	return (
		<m.div
			className="h-5 w-5 rounded-full border-2 border-primary-200 border-t-primary-600"
			animate={{ rotate: 360 }}
			transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
		/>
	);
}

/**
 * Processing animation component that shows pipeline progress
 * through the stages: Downloading → Extracting Audio → Transcribing → Complete
 */
export function ProcessingAnimation({
	currentStage,
	progress,
	errorMessage,
	className = "",
}: ProcessingAnimationProps) {
	const currentIndex = getStageIndex(currentStage);

	if (currentStage === "idle") {
		return null;
	}

	return (
		<MotionWrapper>
			<m.div
				initial={{ opacity: 0, y: 20 }}
				animate={{ opacity: 1, y: 0 }}
				exit={{ opacity: 0, y: -20 }}
				transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
				className={`w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-lg ${className}`}
			>
				{/* Header */}
				<m.div
					className="mb-6 text-center"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.1 }}
				>
					<h3 className="text-lg font-semibold text-neutral-900">
						{currentStage === "error" ? "Processing Failed" : "Processing Video"}
					</h3>
					{currentStage !== "error" && currentStage !== "complete" && (
						<p className="mt-1 text-sm text-neutral-500">This may take a few minutes</p>
					)}
				</m.div>

				{/* Error state */}
				<AnimatePresence mode="wait">
					{currentStage === "error" && (
						<m.div
							key="error"
							initial={{ opacity: 0, scale: 0.95 }}
							animate={{ opacity: 1, scale: 1 }}
							exit={{ opacity: 0, scale: 0.95 }}
							className="flex flex-col items-center gap-4 py-4"
						>
							<div className="flex h-16 w-16 items-center justify-center rounded-full bg-error-500/10">
								<svg
									className="h-8 w-8 text-error-500"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={2}
								>
									<path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</div>
							<p className="text-center text-sm text-neutral-600">
								{errorMessage || "Something went wrong. Please try again."}
							</p>
						</m.div>
					)}
				</AnimatePresence>

				{/* Stages */}
				{currentStage !== "error" && (
					<div className="space-y-4">
						{stageOrder.map((stage, index) => {
							const config = stageConfigs[stage];
							const isActive = stage === currentStage;
							const isCompleted = currentIndex > index || currentStage === "complete";
							const isPending = currentIndex < index && currentStage !== "complete";

							return (
								<m.div
									key={stage}
									initial={{ opacity: 0, x: -20 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{
										duration: 0.4,
										delay: index * 0.1,
										ease: [0.22, 1, 0.36, 1],
									}}
									className="relative"
								>
									<div
										className={`flex items-center gap-4 rounded-xl p-3 transition-colors duration-300 ${
											isActive
												? "bg-primary-50"
												: isCompleted
													? "bg-success-500/5"
													: "bg-neutral-50"
										}`}
									>
										{/* Stage icon/status */}
										<div
											className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
												isActive
													? "bg-primary-100 text-primary-600"
													: isCompleted
														? "bg-success-500 text-white"
														: "bg-neutral-200 text-neutral-400"
											}`}
										>
											<AnimatePresence mode="wait">
												{isCompleted && (
													<m.div
														key="check"
														initial={{ scale: 0 }}
														animate={{ scale: 1 }}
														exit={{ scale: 0 }}
														transition={{ duration: 0.2, ease: "easeOut" }}
													>
														<svg
															className="h-5 w-5"
															fill="none"
															viewBox="0 0 24 24"
															stroke="currentColor"
															strokeWidth={2.5}
														>
															<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
														</svg>
													</m.div>
												)}
												{isActive && !isCompleted && (
													<m.div
														key="active"
														initial={{ scale: 0 }}
														animate={{ scale: 1 }}
														exit={{ scale: 0 }}
													>
														{config.icon}
													</m.div>
												)}
												{isPending && (
													<m.span
														key="pending"
														className="text-sm font-medium"
														initial={{ opacity: 0 }}
														animate={{ opacity: 1 }}
													>
														{index + 1}
													</m.span>
												)}
											</AnimatePresence>
										</div>

										{/* Stage info */}
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span
													className={`font-medium transition-colors duration-300 ${
														isActive
															? "text-primary-700"
															: isCompleted
																? "text-success-500"
																: "text-neutral-400"
													}`}
												>
													{config.label}
												</span>
												{isActive && <Spinner />}
											</div>
											{isActive && (
												<m.p
													initial={{ opacity: 0, height: 0 }}
													animate={{ opacity: 1, height: "auto" }}
													className="mt-0.5 text-sm text-neutral-500"
												>
													{config.description}
												</m.p>
											)}
										</div>
									</div>

									{/* Progress bar for active stage */}
									{isActive && progress !== undefined && (
										<m.div
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											className="mt-2 px-3"
										>
											<div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
												<m.div
													className="h-full rounded-full bg-primary-500"
													initial={{ width: 0 }}
													animate={{ width: `${progress}%` }}
													transition={{ duration: 0.3, ease: "easeOut" }}
												/>
											</div>
											<div className="mt-1 flex justify-end">
												<span className="text-xs text-neutral-500">{progress}%</span>
											</div>
										</m.div>
									)}

									{/* Connector line */}
									{index < stageOrder.length - 1 && (
										<div className="absolute left-[1.9rem] top-[3.25rem] h-4 w-0.5">
											<m.div
												className={`h-full w-full rounded-full transition-colors duration-300 ${
													currentIndex > index || currentStage === "complete"
														? "bg-success-500"
														: "bg-neutral-200"
												}`}
												initial={{ scaleY: 0 }}
												animate={{ scaleY: 1 }}
												transition={{ duration: 0.3, delay: index * 0.1 + 0.2 }}
												style={{ transformOrigin: "top" }}
											/>
										</div>
									)}
								</m.div>
							);
						})}
					</div>
				)}

				{/* Complete state celebration */}
				{currentStage === "complete" && (
					<m.div
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ delay: 0.3, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
						className="mt-6 text-center"
					>
						<m.div
							className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success-500"
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							transition={{
								type: "spring",
								stiffness: 200,
								damping: 10,
								delay: 0.4,
							}}
						>
							<svg
								className="h-8 w-8 text-white"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
								strokeWidth={2.5}
							>
								<path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
							</svg>
						</m.div>
						<m.p
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ delay: 0.6 }}
							className="mt-4 font-medium text-success-500"
						>
							Ready to explore!
						</m.p>
					</m.div>
				)}
			</m.div>
		</MotionWrapper>
	);
}
