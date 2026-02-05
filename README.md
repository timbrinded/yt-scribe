# YTScribe

A YouTube video knowledge base with AI-powered transcription and chat. Add YouTube videos, get AI transcriptions via OpenAI Whisper, and chat with your video content using GPT-4o.

## Features

- **YouTube Integration**: Add videos from any YouTube URL format (watch, shorts, live, embed)
- **AI Transcription**: Automatic audio extraction and transcription using OpenAI Whisper
- **Interactive Chat**: Ask questions about video content with timestamp citations
- **Real-time Progress**: SSE-based status updates during video processing
- **CLI & Web UI**: Both command-line tool and web interface available

## Tech Stack

- **Runtime**: Bun
- **Backend**: Elysia (API server)
- **Frontend**: Astro + React + Tailwind CSS + Framer Motion
- **Database**: SQLite via Drizzle ORM
- **AI**: OpenAI (Whisper for transcription, GPT-4o for chat)
- **Video Processing**: yt-dlp + ffmpeg

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.3+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and in PATH
- [ffmpeg](https://ffmpeg.org/) installed and in PATH
- OpenAI API key
- Google OAuth credentials (for authentication)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/ytscribe.git
cd ytscribe

# Install dependencies
bun install
cd frontend && bun install && cd ..

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys and OAuth credentials

# Initialize the database
bun run db:push

# Start development servers
bun run dev         # Backend on port 3000
cd frontend && bun run dev  # Frontend on port 4321
```

### Using Docker

```bash
# Development with hot reload
docker-compose up

# Production build
docker build -t ytscribe .
docker run -p 3000:3000 \
  -e OPENAI_API_KEY=your-key \
  -e GOOGLE_CLIENT_ID=your-id \
  -e GOOGLE_CLIENT_SECRET=your-secret \
  -v ytscribe-data:/app/data \
  ytscribe
```

## CLI Usage

```bash
# Login via Google OAuth
ytscribe login

# Add a video for transcription
ytscribe add "https://www.youtube.com/watch?v=VIDEO_ID"

# List your video library
ytscribe list
ytscribe list --status completed

# Chat with a transcribed video
ytscribe chat 1

# Logout
ytscribe logout
```

## API Endpoints

| Method | Endpoint                        | Description           |
| ------ | ------------------------------- | --------------------- |
| GET    | `/health`                       | Health check          |
| GET    | `/auth/google`                  | Initiate Google OAuth |
| GET    | `/auth/google/callback`         | OAuth callback        |
| GET    | `/auth/me`                      | Get current user      |
| POST   | `/auth/logout`                  | Logout                |
| DELETE | `/auth/account`                 | Delete account        |
| GET    | `/api/videos`                   | List videos           |
| POST   | `/api/videos`                   | Add new video         |
| GET    | `/api/videos/:id`               | Get video details     |
| POST   | `/api/videos/:id/retry`         | Retry failed video    |
| GET    | `/api/videos/:id/status/stream` | SSE status updates    |
| POST   | `/api/videos/:id/chat`          | Send chat message     |
| GET    | `/api/videos/:id/sessions`      | List chat sessions    |
| GET    | `/api/sessions/:id/messages`    | Get session messages  |

## Deployment

### Railway

1. **Create a new project** in [Railway](https://railway.app)

2. **Connect your repository**
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your ytscribe repository

3. **Configure environment variables** in Railway dashboard:

   ```
   OPENAI_API_KEY=sk-your-api-key
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=https://your-app.up.railway.app/auth/google/callback
   FRONTEND_URL=https://your-app.up.railway.app
   NODE_ENV=production
   ```

4. **Add a volume** for SQLite persistence:
   - Go to your service → Settings → Volumes
   - Add a volume with mount path: `/app/data`

5. **Update Google OAuth** redirect URI:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Update the authorized redirect URI to your Railway URL

6. Railway will automatically deploy using the `railway.toml` configuration.

### Other Platforms

The included `Dockerfile` works with any Docker-compatible platform:

- **Fly.io**: `fly launch`
- **Render**: Connect repo, set Dockerfile path
- **DigitalOcean App Platform**: Deploy from GitHub with Docker
- **Self-hosted**: Run Docker container with volume for `/app/data`

**Important**: SQLite requires persistent storage. Always mount a volume at `/app/data` for data persistence.

## Environment Variables

| Variable               | Required | Default                                      | Description                |
| ---------------------- | -------- | -------------------------------------------- | -------------------------- |
| `OPENAI_API_KEY`       | Yes      | -                                            | OpenAI API key             |
| `GOOGLE_CLIENT_ID`     | Yes      | -                                            | Google OAuth client ID     |
| `GOOGLE_CLIENT_SECRET` | Yes      | -                                            | Google OAuth client secret |
| `PORT`                 | No       | `3000`                                       | Server port                |
| `DATABASE_URL`         | No       | `data/ytscribe.db`                           | SQLite database path       |
| `GOOGLE_REDIRECT_URI`  | No       | `http://localhost:3000/auth/google/callback` | OAuth redirect             |
| `FRONTEND_URL`         | No       | `http://localhost:4321`                      | Frontend URL for redirects |
| `LOG_LEVEL`            | No       | `debug`/`info`                               | Logging level              |
| `NODE_ENV`             | No       | `development`                                | Environment mode           |
| `PUBLIC_API_URL`       | No       | `http://localhost:3000`                      | API URL for frontend       |

## Development

```bash
# Run tests
bun test                    # Backend tests
cd frontend && bun test     # Frontend tests

# Type checking
bun run typecheck

# Linting
bun run lint

# Format code
bun run format

# Database migrations
bun run db:push            # Push schema changes
bun run db:generate        # Generate migration files
```

## Project Structure

```
ytscribe/
├── src/
│   ├── server.ts          # Elysia server entry point
│   ├── db/                # Database schema and connection
│   ├── auth/              # OAuth and session management
│   ├── routes/            # API route handlers
│   ├── services/          # Business logic (pipeline, chat, etc.)
│   ├── middleware/        # Auth and logging middleware
│   ├── cli/               # CLI commands
│   └── utils/             # Utilities (logger)
├── frontend/
│   ├── src/
│   │   ├── pages/         # Astro pages
│   │   ├── components/    # React components
│   │   ├── layouts/       # Page layouts
│   │   ├── hooks/         # React hooks
│   │   └── styles/        # Global CSS
│   └── tests/             # Frontend tests
├── tests/                 # Backend tests
├── data/                  # SQLite database and downloads
├── Dockerfile             # Production Docker image
├── docker-compose.yml     # Development Docker setup
└── railway.toml           # Railway deployment config
```

## License

MIT
