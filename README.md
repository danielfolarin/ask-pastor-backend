# Ask Pastor Daniel, Backend

A tiny Node server for your Blogger widget.

## Quick start

1. Install Node 18 or newer.
2. Run:

```bash
npm install
npm start
```

This starts on http://localhost:8080

## Configure CORS

Set the environment variable so your site can call it:

```
ALLOWED_ORIGINS=https://www.thecuriousseekers.com, https://thecuriousseekers.com
```

## Connect a model

By default, the server replies in "demo mode". To enable real AI responses, set these three env vars:

- `MODEL_API_URL`  The chat completions endpoint for your provider.
- `MODEL_API_KEY`  Your API key.
- `MODEL_NAME`     The model id.

Restart after setting them.

## Deploy notes

Works well on Render, Railway, Fly, or any Node host.
- Build command: `npm install`
- Start command: `npm start`
- Env vars: `ALLOWED_ORIGINS`, and later the three model vars.
