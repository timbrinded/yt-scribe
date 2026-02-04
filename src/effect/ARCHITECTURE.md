# Effect-TS Service Architecture

This document describes the Effect-TS service architecture for YTScribe, including
service dependencies, layer composition patterns, and testing strategies.

## Overview

YTScribe uses Effect-TS for:
- **Typed error handling** via discriminated union error types
- **Dependency injection** via Context.Tag and Layer
- **Resource management** via scoped effects (acquireRelease)
- **Structured concurrency** via Fibers for background processing

## Service Dependency Graph

```
                           ┌────────────────────────────────────────────┐
                           │              Orchestration Layer           │
                           │                                            │
                           │   ┌─────────────────────────────────────┐ │
                           │   │              Pipeline               │ │
                           │   │  (processVideo orchestration)       │ │
                           │   └─────────────────────────────────────┘ │
                           │        │         │          │          │   │
                           │        ▼         ▼          ▼          ▼   │
                           └────────┬─────────┬──────────┬──────────┬──┘
                                    │         │          │          │
                           ┌────────┴─────────┴──────────┴──────────┴──┐
                           │              Dependent Layer               │
                           │                                            │
  ┌──────────────────┐     │  ┌─────────────┐  ┌─────────────┐         │
  │   Auth Service   │──┐  │  │Transcription│  │    Chat     │         │
  │ (session mgmt)   │  │  │  │  (Whisper)  │  │  (GPT-4o)   │         │
  └──────────────────┘  │  │  └─────────────┘  └─────────────┘         │
           │            │  │        │                │                  │
           │            │  │        └────────┬───────┘                  │
           ▼            │  │                 ▼                          │
  ┌──────────────────┐  │  └─────────────────┬─────────────────────────┘
  │                  │  │                    │
  │                  │  │                    │
  │                  │◀─┘           ┌────────┴────────┐
  │                  │             │                  │
  └──────────────────┘             │                  │
                                   ▼                  ▼
                           ┌────────────────────────────────────────────┐
                           │                Leaf Layer                  │
                           │                                            │
  ┌──────────────────┐     │  ┌────────────┐  ┌────────────┐            │
  │     Database     │     │  │   OpenAI   │  │  YouTube   │  ┌───────┐ │
  │    (SQLite)      │     │  │  (client)  │  │  (yt-dlp)  │  │Progress│ │
  └──────────────────┘     │  └────────────┘  └────────────┘  └───────┘ │
                           │                                            │
                           └────────────────────────────────────────────┘
```

## Service Categories

### Leaf Services (No Dependencies)

These services have no Effect-TS service dependencies. They may read environment
variables via `Config` but don't depend on other service tags.

| Service | Purpose | Layer Type | Notes |
|---------|---------|------------|-------|
| **Database** | SQLite connection | `Layer.scoped` | Uses acquireRelease for connection lifecycle |
| **YouTube** | URL validation, metadata, download | `Layer.effect` | Shells out to yt-dlp |
| **Progress** | Event emitter for SSE | `Layer.scoped` | Uses PubSub for broadcasting |
| **OpenAI** | OpenAI SDK client | `Layer.effect` | Reads `OPENAI_API_KEY` via Config |

### Config-Dependent Services

These services read configuration from environment variables using Effect's `Config`:

| Service | Config Required | Purpose |
|---------|-----------------|---------|
| **OpenAI** | `OPENAI_API_KEY` | API authentication |
| **Database** | `DATABASE_URL` (optional) | Database path (default: `data/ytscribe.db`) |

### Service-Dependent Services

These services depend on other Effect services via `yield* ServiceTag`:

| Service | Dependencies | Purpose |
|---------|--------------|---------|
| **Transcription** | OpenAI | Whisper API for audio transcription |
| **Chat** | OpenAI | GPT-4o for chat completions |
| **Auth** | Database | Session validation and user management |
| **Pipeline** | Database, YouTube, Transcription, Progress | Orchestrates video processing |

## Layer Composition

### Composition Order

Layers must be composed in dependency order: **leaf → dependent → orchestration**

```typescript
// 1. Leaf services (no dependencies)
const LeafLayer = Layer.mergeAll(
  Database.Live,
  OpenAI.Live,
  YouTube.Live,
  Progress.Live
)

// 2. Dependent services (need leaf services)
const TranscriptionLayer = Transcription.Live.pipe(
  Layer.provide(OpenAI.Live)
)
const ChatLayer = Chat.Live.pipe(
  Layer.provide(OpenAI.Live)
)
const AuthLayer = Auth.Live.pipe(
  Layer.provide(Database.Live)
)

// 3. Merge dependent layer
const DependentLayer = Layer.mergeAll(
  TranscriptionLayer,
  ChatLayer,
  AuthLayer
)

// 4. Orchestration layer (needs all services)
const PipelineLayer = Pipeline.Live.pipe(
  Layer.provide(Layer.merge(LeafLayer, DependentLayer))
)

// 5. Full application layer
export const AppLayer = Layer.mergeAll(
  LeafLayer,
  DependentLayer,
  PipelineLayer
)
```

### Layer Composition Functions

| Function | Purpose | When to Use |
|----------|---------|-------------|
| `Layer.merge(A, B)` | Combines two layers into one | When you need both services available |
| `Layer.mergeAll(A, B, C, ...)` | Combines multiple layers | When merging 3+ layers at once |
| `Layer.provide(requirements)` | Satisfies a layer's requirements | When a layer depends on other services |
| `Layer.provideMerge(requirements)` | Provides and merges in one step | Shorthand for provide + merge |

### Layer.provide vs Layer.provideMerge

```typescript
// Layer.provide: Satisfies requirements, output only has DependentService
const layer1 = Dependent.Live.pipe(Layer.provide(Leaf.Live))
// Type: Layer<Dependent, never, never>

// Layer.provideMerge: Satisfies AND includes requirements in output
const layer2 = Dependent.Live.pipe(Layer.provideMerge(Leaf.Live))
// Type: Layer<Dependent | Leaf, never, never>
```

Use `Layer.provideMerge` when you want downstream consumers to also have access
to the requirement services.

## Layer Memoization

**Critical Rule:** Store composed layers in constants to ensure services are
created once and shared.

### Correct Pattern (Memoized)

```typescript
// ✅ Good: Layer is stored in a constant
const DatabaseLayer = Database.Live
const AuthLayer = Auth.Live.pipe(Layer.provide(DatabaseLayer))

// Both program1 and program2 share the same Database instance
const program1 = effect1.pipe(Effect.provide(AuthLayer))
const program2 = effect2.pipe(Effect.provide(AuthLayer))
```

### Incorrect Pattern (Not Memoized)

```typescript
// ❌ Bad: New layer created on each call
function getAuthLayer() {
  return Auth.Live.pipe(Layer.provide(Database.Live))
}

// Creates TWO separate Database connections!
const program1 = effect1.pipe(Effect.provide(getAuthLayer()))
const program2 = effect2.pipe(Effect.provide(getAuthLayer()))
```

### MemoMap (Advanced)

For dynamic scenarios where you need explicit memoization control:

```typescript
import { MemoMap, Layer } from "effect"

const memoMap = MemoMap.make()
const memoizedLayer = Layer.buildWithMemoMap(layer, memoMap)
```

## Testing with Dependency Injection

### Overview

Effect's DI system enables testing by swapping `Live` layers with `Test` layers:

```typescript
// Production code uses Live layers
const prodResult = await Effect.runPromise(
  program.pipe(Effect.provide(AppLayer))
)

// Test code swaps in Test layers
const testResult = await Effect.runPromise(
  program.pipe(Effect.provide(TestLayer))
)
```

### Test Layer Pattern

Each service provides both `.Live` and `.Test` static layers:

```typescript
export class Transcription extends Context.Tag("@ytscribe/Transcription")<...>() {
  // Production: Uses real OpenAI Whisper API
  static readonly Live = Layer.effect(...)

  // Testing: Returns canned response, no API calls
  static readonly Test = Layer.succeed(...)
}
```

### Partial Mock Factory

For tests that need specific behavior, use a factory function:

```typescript
// In service file
export function makeTranscriptionTestLayer(
  overrides: Partial<TranscriptionService>
): Layer.Layer<Transcription> {
  const defaultImpl: TranscriptionService = {
    transcribe: (path) => Effect.succeed({ text: "mock", segments: [] })
  }
  return Layer.succeed(Transcription, { ...defaultImpl, ...overrides })
}

// In test file
const failingTranscription = makeTranscriptionTestLayer({
  transcribe: () => Effect.fail(new TranscriptionFailedError(...))
})

const result = await Effect.runPromise(
  program.pipe(Effect.provide(failingTranscription))
)
```

### Composing Test Layers

```typescript
// In src/effect/layers/Test.ts
export const TestLayer = Layer.mergeAll(
  Database.Test,    // In-memory SQLite
  OpenAI.Test,      // Mock client
  YouTube.Test,     // No network calls
  Progress.Test,    // Silent events
  Transcription.Test,
  Chat.Test,
  Auth.Test,
  Pipeline.Test
)

// Factory for partial mocks
export function makeTestLayer(overrides: {
  database?: Layer.Layer<Database>,
  openai?: Layer.Layer<OpenAI>,
  youtube?: Layer.Layer<YouTube>,
  // ... etc
}): Layer.Layer<AppRequirements> {
  return Layer.mergeAll(
    overrides.database ?? Database.Test,
    overrides.openai ?? OpenAI.Test,
    // ... etc
  )
}
```

### Test Examples

```typescript
import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import { Pipeline } from "../services/Pipeline"
import { makeTestLayer } from "../layers/Test"

describe("Pipeline", () => {
  it("processes video successfully with mocked services", async () => {
    const testLayer = makeTestLayer({
      youtube: makeYouTubeTestLayer({
        downloadAudio: () => Effect.succeed("/tmp/test.m4a")
      })
    })

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const pipeline = yield* Pipeline
        return yield* pipeline.processVideo(123)
      }).pipe(Effect.provide(testLayer))
    )

    expect(result.status).toBe("completed")
  })

  it("marks video as failed on transcription error", async () => {
    const testLayer = makeTestLayer({
      transcription: makeTranscriptionTestLayer({
        transcribe: () => Effect.fail(new TranscriptionFailedError({
          videoId: 123,
          reason: "API error"
        }))
      })
    })

    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const pipeline = yield* Pipeline
        return yield* pipeline.processVideo(123)
      }).pipe(Effect.provide(testLayer))
    )

    expect(Exit.isFailure(result)).toBe(true)
  })
})
```

## Directory Structure

```
src/effect/
├── ARCHITECTURE.md          # This document
├── errors/
│   └── index.ts             # Schema.TaggedError definitions
├── services/
│   ├── _template.ts         # Reference pattern for new services
│   ├── Database.ts          # SQLite connection (Layer.scoped)
│   ├── OpenAI.ts            # OpenAI client (Layer.effect + Config)
│   ├── YouTube.ts           # yt-dlp wrapper (Layer.effect)
│   ├── Progress.ts          # Event emitter (Layer.scoped + PubSub)
│   ├── Transcription.ts     # Whisper API (depends: OpenAI)
│   ├── Chat.ts              # GPT-4o API (depends: OpenAI)
│   ├── Auth.ts              # Sessions (depends: Database)
│   └── Pipeline.ts          # Orchestration (depends: all)
├── layers/
│   ├── Live.ts              # Production layer composition
│   └── Test.ts              # Test layer composition + factories
├── api/
│   ├── index.ts             # HttpApi.make("ytscribe")
│   ├── middleware/
│   │   └── auth.ts          # Authorization HttpApiMiddleware
│   ├── groups/
│   │   ├── videos.ts        # Video endpoint schemas
│   │   ├── chat.ts          # Chat endpoint schemas
│   │   └── auth.ts          # Auth endpoint schemas
│   └── handlers/
│       ├── videos.ts        # Video endpoint implementations
│       ├── chat.ts          # Chat endpoint implementations
│       └── auth.ts          # Auth endpoint implementations
└── main.ts                  # BunRuntime.runMain entry point
```

## Migration Strategy

The Effect-TS migration proceeds in phases:

### Phase 1: Foundation ✅
- [x] Install Effect-TS dependencies
- [x] Create error types with Schema.TaggedError
- [x] Establish service definition pattern
- [x] Document architecture (this file)

### Phase 2: Core Services (Current)
- [ ] Create base service types and conventions
- [ ] Document test DI pattern for service replacement
- [ ] Create Database Effect service
- [ ] Create OpenAI Effect service
- [ ] Create YouTube Effect service
- [ ] Create Progress Effect service

### Phase 3: Dependent Services
- [ ] Create Transcription Effect service
- [ ] Create Chat Effect service
- [ ] Create Auth Effect service and middleware
- [ ] Create Pipeline Effect service

### Phase 4: HTTP API
- [ ] Define HttpApi schema and groups
- [ ] Implement video endpoint handlers
- [ ] Implement chat endpoint handlers
- [ ] Implement auth endpoint handlers
- [ ] Implement SSE endpoint for video status

### Phase 5: Integration
- [ ] Create Live and Test layer compositions
- [ ] Create main entry point with BunRuntime
- [ ] Add graceful shutdown handling
- [ ] Serve frontend static files
- [ ] Update package.json scripts

### Phase 6: Cleanup
- [ ] Remove Elysia and old service files
- [ ] Remove old middleware
- [ ] Create test infrastructure
- [ ] Add comprehensive tests

## Appendix: Effect Patterns Quick Reference

### Creating an Effect

```typescript
// Pure value
Effect.succeed(value)

// Sync computation that may throw
Effect.try(() => JSON.parse(str))

// Async operation
Effect.tryPromise(() => fetch(url))

// Failing effect
Effect.fail(new MyError())

// From nullable
Effect.fromNullable(value, () => new NotFoundError())
```

### Composing Effects with Generators

```typescript
const program = Effect.gen(function* () {
  const db = yield* Database
  const user = yield* db.findUser(id)
  return user.name
})
```

### Error Handling

```typescript
// Catch specific error
effect.pipe(
  Effect.catchTag("NotFoundError", (e) => Effect.succeed(defaultValue))
)

// Map error
effect.pipe(
  Effect.mapError((e) => new WrappedError(e))
)

// Ensure cleanup runs
effect.pipe(
  Effect.ensuring(cleanup)
)
```

### Running Effects

```typescript
// In production
BunRuntime.runMain(Layer.launch(HttpLive))

// In tests
await Effect.runPromise(effect.pipe(Effect.provide(TestLayer)))

// Check for failure
const exit = await Effect.runPromiseExit(effect)
if (Exit.isFailure(exit)) {
  const cause = exit.cause
}
```
