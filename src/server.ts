import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { authRoutes } from "./auth/routes";
import { loggingMiddleware } from "./middleware/logging";
import { chatRoutes } from "./routes/chat";
import { sessionRoutes } from "./routes/sessions";
import { videoRoutes } from "./routes/videos";
import { logger } from "./utils/logger";

const app = new Elysia()
	.use(loggingMiddleware)
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

logger.info(
	{ host: app.server?.hostname, port: app.server?.port },
	`Server started at ${app.server?.hostname}:${app.server?.port}`,
);

export type App = typeof app;
