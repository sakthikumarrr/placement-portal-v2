# Vercel deployment notes

## Required Vercel environment variables

Add each variable separately in Project Settings -> Environment Variables:

- `MONGODB_URI`: MongoDB Atlas connection string only
- `JWT_SECRET`: a long, random secret value (not a `JWT_SECRET=...` line pasted into MONGODB_URI)
- `JWT_EXPIRES_IN`: `7d` (optional; this is the application's default)
- `CLIENT_URL`: your deployed site origin, e.g. `https://your-project.vercel.app`
- `JUDGE0_URL`: only if coding execution is configured
- `JUDGE0_API_KEY`, `JUDGE0_API_HOST`, `JUDGE0_AUTH_TOKEN`: only if required by your Judge0 provider

Do not upload `.env` to GitHub or share it. Rotate any credentials that have been exposed.

## Important file-upload limitation

This patch moves profile-photo and resume writes from the read-only deployment folder to `/tmp`, so the function can start on Vercel. Vercel `/tmp` storage is temporary and can disappear between deployments or function instances. For permanent resume/profile storage, integrate an object-storage provider (for example, Cloudinary or S3-compatible storage) before relying on uploads in production.

## Deploy

Commit and push the changed files to the `main` branch. Vercel should redeploy automatically.
