import { useState, useEffect } from "react";
import {
	ProcessingAnimation,
	type ProcessingStage,
} from "./ProcessingAnimation";

const stages: ProcessingStage[] = [
	"downloading",
	"extracting",
	"transcribing",
	"complete",
];

/**
 * Demo component to showcase the ProcessingAnimation with interactive controls
 * and auto-play mode for testing stage transitions
 */
export function ProcessingDemo() {
	const [currentStage, setCurrentStage] = useState<ProcessingStage>("idle");
	const [progress, setProgress] = useState<number | undefined>(undefined);
	const [isAutoPlaying, setIsAutoPlaying] = useState(false);
	const [showError, setShowError] = useState(false);

	// Auto-play through stages
	useEffect(() => {
		if (!isAutoPlaying || showError) return;

		let stageIndex = 0;
		let progressValue = 0;
		setCurrentStage("downloading");
		setProgress(0);

		const progressInterval = setInterval(() => {
			progressValue += Math.random() * 15 + 5;
			if (progressValue >= 100) {
				progressValue = 0;
				stageIndex++;
				if (stageIndex >= stages.length) {
					setIsAutoPlaying(false);
					setProgress(undefined);
					clearInterval(progressInterval);
					return;
				}
				const nextStage = stages[stageIndex];
				if (nextStage) {
					setCurrentStage(nextStage);
				}
			}
			if (stageIndex < stages.length - 1) {
				setProgress(Math.min(Math.round(progressValue), 100));
			} else {
				setProgress(undefined);
			}
		}, 500);

		return () => clearInterval(progressInterval);
	}, [isAutoPlaying, showError]);

	const handleReset = () => {
		setCurrentStage("idle");
		setProgress(undefined);
		setIsAutoPlaying(false);
		setShowError(false);
	};

	const handleShowError = () => {
		setShowError(true);
		setCurrentStage("error");
		setProgress(undefined);
		setIsAutoPlaying(false);
	};

	return (
		<div className="flex flex-col items-center gap-8 p-8">
			<h2 className="text-2xl font-bold text-neutral-900">
				Processing Animation Demo
			</h2>

			{/* Animation display */}
			<div className="flex min-h-[400px] items-center justify-center">
				{currentStage === "idle" ? (
					<p className="text-neutral-500">
						Click "Start Demo" to see the animation
					</p>
				) : (
					<ProcessingAnimation
						currentStage={currentStage}
						progress={progress}
						errorMessage={
							showError ? "Network error: Unable to download video" : undefined
						}
					/>
				)}
			</div>

			{/* Controls */}
			<div className="flex flex-wrap justify-center gap-4">
				<button
					onClick={() => setIsAutoPlaying(true)}
					disabled={isAutoPlaying}
					className="rounded-lg bg-primary-600 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
				>
					Start Demo
				</button>
				<button
					onClick={handleShowError}
					className="rounded-lg border border-error-500 px-4 py-2 font-medium text-error-500 transition-colors hover:bg-error-50"
				>
					Show Error
				</button>
				<button
					onClick={handleReset}
					className="rounded-lg border border-neutral-300 px-4 py-2 font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
				>
					Reset
				</button>
			</div>

			{/* Manual stage controls */}
			<div className="flex flex-wrap justify-center gap-2">
				{(["idle", ...stages, "error"] as ProcessingStage[]).map((stage) => (
					<button
						key={stage}
						onClick={() => {
							setCurrentStage(stage);
							setIsAutoPlaying(false);
							setShowError(stage === "error");
							setProgress(
								stage !== "idle" && stage !== "complete" && stage !== "error"
									? 45
									: undefined,
							);
						}}
						className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
							currentStage === stage
								? "bg-primary-600 text-white"
								: "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
						}`}
					>
						{stage}
					</button>
				))}
			</div>
		</div>
	);
}
