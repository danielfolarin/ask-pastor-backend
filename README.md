# Ask Pastor Daniel AI

A public, retrieval-grounded theological assistant based on the documented
teachings and convictions of Dr. Daniel Folarin.

## Features

- Public responsive chat interface
- Retrieval across Pastor Daniel's source library
- Source titles and page citations
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
