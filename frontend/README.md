# ghostBooker frontend

Mobile-first search page for the backend in `../backend`.

```sh
npm install
npm run dev   # http://localhost:5173
```

The backend must be running on port 3000. Vite forwards `/api` to it (see `vite.config.ts`), so no CORS setup is
needed in development.

- **Find fares** runs a live search (1 + "Check" fare lookups, cached by the backend).
- **Preview routes** shows which destinations would be checked, using only the local schedule.
