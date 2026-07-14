# Ask Pastor Daniel AI

A public, retrieval-grounded theological assistant based on the documented
teachings and convictions of Dr. Daniel Folarin.

## Features

- Public responsive chat interface
- Retrieval across Pastor Daniel's source library
- Source titles and page citations
- Private admin question logs with search, feedback ratings, and CSV export
- Persistent Postgres/Supabase logging when `DATABASE_URL` is configured
- Separation of primary teaching from external reference works
- Crisis and abuse safety responses
- Rate limiting, input limits, and validated conversation history

## Local Start

```bash
npm install
cp .env.example .env
npm start
```

Open `http://localhost:8080`.

## Deploy on Render

The included `render.yaml` creates the web service. Set `MODEL_API_KEY` as a
secret environment variable in Render. Never commit the API key.

Set `ADMIN_PASSWORD` as a secret environment variable to enable the private
admin dashboard.

- Dashboard: `/admin`
- CSV export: `/admin/export.csv`
- Set `DATABASE_URL` to a Supabase or Postgres connection string for persistent
  logs that survive deploys and restarts.
- If `DATABASE_URL` is not set, logs fall back to `data/question-logs.jsonl`.
  That local fallback is ignored by Git and never served from the public
  frontend, but it is not persistent on Render Free.
- The app automatically creates the `question_logs` table when `DATABASE_URL`
  is configured.

## Keep Render Free Warm

Render Free services can go to sleep when they are idle. To reduce cold-start
waiting for the first visitor, configure an external uptime monitor to request:

```text
https://askpastordaniel.greathaven.org/health
```

The `/health` endpoint returns HTTP 200 with only:

```json
{
  "status": "ok",
  "timestamp": "2026-07-14T00:00:00.000Z"
}
```

It does not query the database, call OpenAI, read secrets, or expose
environment variables. It is registered before the heavier middleware so it
stays as lightweight as possible.

### UptimeRobot

1. Create or sign in to an UptimeRobot account.
2. Choose **New Monitor**.
3. Select **HTTP(s)** as the monitor type.
4. Enter a friendly name such as `Ask Pastor Daniel AI Health`.
5. Set the URL to `https://askpastordaniel.greathaven.org/health`.
6. Set the monitoring interval to **10 minutes**.
7. Save the monitor.

### Better Stack

1. Create or sign in to a Better Stack account.
2. Go to **Uptime** and choose **Create monitor**.
3. Select an **HTTP** monitor.
4. Set the URL to `https://askpastordaniel.greathaven.org/health`.
5. Set the check frequency to **10 minutes**.
6. Save the monitor.

### cron-job.org

1. Create or sign in to a cron-job.org account.
2. Choose **Create cronjob**.
3. Set the URL to `https://askpastordaniel.greathaven.org/health`.
4. Set the request method to **GET**.
5. Set the schedule to run every **10 minutes**.
6. Save and enable the cronjob.
