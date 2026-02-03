import { useState } from "react";
import { ErrorBoundary } from "./ErrorBoundary";

/**
 * Component that throws an error when triggered.
 * Used to test and demonstrate the ErrorBoundary component.
 */
function BuggyComponent({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) {
		throw new Error("This is a test error thrown by BuggyComponent!");
	}

	return (
		<div className="rounded-lg border border-success-500/30 bg-success-500/10 p-6">
			<div className="flex items-center gap-3">
				<svg
					className="h-6 w-6 text-success-500"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					strokeWidth={2}
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p className="font-medium text-success-500">
					Component is working correctly!
				</p>
			</div>
		</div>
	);
}

/**
 * Demo component for testing the ErrorBoundary.
 * Wraps a buggy component and provides controls to trigger errors.
 */
export function ErrorTestComponent() {
	const [shouldThrow, setShouldThrow] = useState(false);
	const [key, setKey] = useState(0);

	const triggerError = () => {
		setShouldThrow(true);
	};

	const resetDemo = () => {
		setShouldThrow(false);
		setKey((prev) => prev + 1);
	};

	return (
		<div className="space-y-6">
			{/* Control buttons */}
			<div className="flex gap-4">
				<button
					type="button"
					onClick={triggerError}
					disabled={shouldThrow}
					className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
						/>
					</svg>
					Trigger Error
				</button>
				<button
					type="button"
					onClick={resetDemo}
					className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
				>
					<svg
						className="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
					Reset Demo
				</button>
			</div>

			{/* Error boundary wrapper */}
			<div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
				<h3 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
					Error Boundary Zone
				</h3>
				<ErrorBoundary key={key}>
					<BuggyComponent shouldThrow={shouldThrow} />
				</ErrorBoundary>
			</div>

			{/* Instructions */}
			<div className="rounded-lg bg-neutral-100 p-4 text-sm text-neutral-600">
				<p className="font-medium text-neutral-800">How it works:</p>
				<ul className="mt-2 list-inside list-disc space-y-1">
					<li>
						Click "Trigger Error" to simulate a component crash inside the error
						boundary
					</li>
					<li>
						The ErrorBoundary will catch the error and display a fallback UI
					</li>
					<li>Click "Try again" in the fallback to reset the error boundary</li>
					<li>
						Click "Reset Demo" to completely reset the component to its initial
						state
					</li>
				</ul>
			</div>
		</div>
	);
}
