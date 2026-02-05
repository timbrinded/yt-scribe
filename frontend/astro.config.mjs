// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import clerk from "@clerk/astro";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
	output: "server",

	adapter: node({
		mode: "standalone",
	}),

	integrations: [react(), clerk()],

	vite: {
		plugins: [tailwindcss()],
	},
});
