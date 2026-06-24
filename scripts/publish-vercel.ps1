Param()

if (-not $env:VERCEL_TOKEN) {
  Write-Host "Please set VERCEL_TOKEN environment variable before running this script."
  exit 1
}

Write-Host "Deploying main webapp to Vercel (production)..."
npx vercel --prod --token $env:VERCEL_TOKEN
