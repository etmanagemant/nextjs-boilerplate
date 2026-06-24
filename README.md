This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Webhook & funnel integration

If you run a separate funnel on its own domain and want submissions forwarded into this webapp, set the following env vars in Vercel for this project:

- `MAIN_APP_INCOMING_SECRET` — secret string the funnel will include in `x-funnel-secret` header.

The funnel should POST submissions to: `https://your-main-app.example.com/api/funnel-submissions`.

Admin access

The header already shows admin-only links when a user has the `admin` role. The new admin page `/bewerbungen` shows incoming funnel submissions stored on disk under `funnel-submissions/`.

Security note: For production, store submissions in a database instead of filesystem and protect the admin routes using your auth provider.

Quick deploy via Vercel (automated)

1. In your Vercel project for the main webapp (`etmanagement`), add environment variable `MAIN_APP_INCOMING_SECRET` with the same secret you set for the funnel.
2. Obtain a `VERCEL_TOKEN` from your Vercel account and add it to GitHub Secrets so the repository Actions workflow can deploy automatically.

Local deploy using vercel CLI (PowerShell):
```powershell
$env:VERCEL_TOKEN = "<your-token>"
.
scripts\publish-vercel.ps1
```

