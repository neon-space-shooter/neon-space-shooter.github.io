# Neon Space Shooter — Discord Activity Build

This is a separate Discord build based on the CrazyGames Basic Launch game. The CrazyGames SDK has been removed from this copy.

## Frontend
- `index.html` + `assets/` = Discord Activity game.
- `discord-activity.js` loads the official `@discord/embedded-app-sdk`, authenticates the Discord user, and submits scores to `/api/score`.
- The frontend falls back safely when opened outside Discord.

## Backend / Bot
`server/` contains an Express API and Discord.js bot.

Environment variables:
- `DISCORD_CLIENT_ID=1555904522943987762`
- `DISCORD_CLIENT_SECRET=...` (keep secret)
- `DISCORD_BOT_TOKEN=...` (keep secret)
- `PUBLIC_ORIGIN=https://YOUR-BACKEND-DOMAIN.example.com`

Run:
```bash
cd server
npm install
npm start
```

Commands:
- `/top`
- `/rank`
- `/compare @Player`
- `/stats`
- `/setchannel`

## Discord URL Mapping
The Activity frontend can remain on GitHub Pages. Configure a Discord URL Mapping for the API path `/api` to your deployed backend host. Do not put secrets in the frontend.

## Important
The browser game remains client-side, so the backend associates scores with the authenticated Discord account, but a fully cheat-resistant score requires server-authoritative gameplay or additional anti-cheat validation. This package does not claim to provide cryptographic proof that a client-reported score was earned honestly.
