import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Mock ResizeObserver for components that use it (like assistant-ui)
class ResizeObserverMock {
	observe() {}
	unobserve() {}
	disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// Mock Element.scrollTo for assistant-ui viewport auto-scroll
Element.prototype.scrollTo = function () {};

// Mock window.scrollTo
window.scrollTo = function () {};

// Cleanup after each test
afterEach(() => {
	cleanup();
});
