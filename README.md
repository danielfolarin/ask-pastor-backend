# Ask Pastor Daniel AI

A public, retrieval-grounded theological assistant based on the documented
teachings and convictions of Dr. Daniel Folarin.

## Features

- Public responsive chat interface
- Retrieval across Pastor Daniel's source library
- Source titles and page citations
- Private admin question logs with search, feedback ratings, and CSV export
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
- Logs are stored server-side in `data/question-logs.jsonl`, which is ignored
  by Git and never served from the public frontend.
