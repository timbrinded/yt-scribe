import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { authRoutes } from "./auth/routes";
import { chatRoutes } from "./routes/chat";
import { sessionRoutes } from "./routes/sessions";
import { videoRoutes } from "./routes/videos";

const app = new Elysia()
	.use(cors())
	.get("/health", () => ({
		status: "ok",
		timestamp: new Date().toISOString(),
	}))
	.use(authRoutes)
	.use(videoRoutes)
	.use(chatRoutes)
	.use(sessionRoutes)
	.listen(process.env.PORT ?? 3000);

console.log(
	`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
