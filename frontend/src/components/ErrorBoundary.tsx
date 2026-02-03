import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

/**
 * React Error Boundary component that catches JavaScript errors anywhere in the
 * child component tree and displays a fallback UI instead of crashing.
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
		// Log error to console in development
		console.error("ErrorBoundary caught an error:", error, errorInfo);
	}

	handleReset = (): void => {
		this.setState({ hasError: false, error: null });
	};

	render(): ReactNode {
		if (this.state.hasError) {
			// Custom fallback provided
			if (this.props.fallback) {
				return this.props.fallback;
			}

			// Default fallback UI
			return (
				<div className="flex min-h-[400px] flex-col items-center justify-center p-8">
					<div className="w-full max-w-md text-center">
						{/* Error icon */}
						<div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-error-500/10">
							<svg
								className="h-8 w-8 text-error-500"
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
						</div>

						<h2 className="mb-2 text-xl font-semibold text-neutral-900">
							Something went wrong
						</h2>
						<p className="mb-6 text-neutral-500">
							An unexpected error occurred. Please try again or refresh the
							page.
						</p>

						{/* Error details (development only) */}
						{import.meta.env.DEV && this.state.error && (
							<div className="mb-6 rounded-lg bg-neutral-100 p-4 text-left">
								<p className="mb-1 text-sm font-medium text-neutral-700">
									Error details:
								</p>
								<p className="font-mono text-sm text-error-500">
									{this.state.error.message}
								</p>
							</div>
						)}

						<div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
							<button
								type="button"
								onClick={this.handleReset}
								className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
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
								Try again
							</button>
							<a
								href="/"
								className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
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
										d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
									/>
								</svg>
								Go home
							</a>
						</div>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

/**
 * Hook-style component for using ErrorBoundary with functional components.
 * Wraps children in an ErrorBoundary and allows resetting via the provided callback.
 */
interface ErrorBoundaryWrapperProps {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

export function ErrorBoundaryWrapper({
	children,
	fallback,
}: ErrorBoundaryWrapperProps) {
	return <ErrorBoundary fallback={fallback}>{children}</ErrorBoundary>;
}
