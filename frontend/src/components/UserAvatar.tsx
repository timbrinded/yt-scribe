/**
 * UserAvatar component using Clerk's UserButton
 *
 * Displays the authenticated user's avatar with Clerk's built-in dropdown menu.
 * Shows a sign-in button when not authenticated.
 */

import {
	SignedIn,
	SignedOut,
	SignInButton,
	UserButton,
} from "@clerk/astro/react";

interface UserAvatarProps {
	/** Optional class name for the container */
	className?: string;
}

/**
 * UserAvatar component displays the user's avatar with a dropdown menu
 * Uses Clerk's UserButton for authenticated users
 * Shows SignInButton for unauthenticated users
 */
export function UserAvatar({ className = "" }: UserAvatarProps) {
	return (
		<div className={className}>
			<SignedIn>
				<UserButton
					afterSignOutUrl="/"
					appearance={{
						elements: {
							avatarBox: "h-9 w-9",
							userButtonTrigger:
								"ring-2 ring-transparent transition-all hover:ring-primary-200 focus:outline-none focus:ring-primary-300",
						},
					}}
					userProfileUrl="/settings"
					showName={false}
				>
					<UserButton.MenuItems>
						<UserButton.Link
							label="My Library"
							labelIcon={
								<svg
									className="h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
									strokeWidth={1.5}
								>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
									/>
								</svg>
							}
							href="/library"
						/>
					</UserButton.MenuItems>
				</UserButton>
			</SignedIn>
			<SignedOut>
				<SignInButton mode="modal">
					<button className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary-700">
						Sign In
					</button>
				</SignInButton>
			</SignedOut>
		</div>
	);
}
