# Scheduler Worker

This worker triggers the backend scheduler endpoint on an interval.

## Local setup

1. Copy `.env.example` to `.env`.
2. Set `WORKER_SHARED_SECRET` in `scheduler-worker/.env`.
3. Set the same `WORKER_SHARED_SECRET` in `Backend/.env`.
4. Start backend first.
5. Start worker:

```bash
npm install
npm run dev
```

## Notes

- Worker endpoint called: `POST /api/worker/scheduler/run?batch=<size>`
- Header used for auth: `x-worker-secret`
- Minimum interval is clamped to `5000ms`
