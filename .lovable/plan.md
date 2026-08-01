# Push the SafeDeal codebase to GitHub

## What I checked

The sandbox checkout has a clean working tree (nothing uncommitted) and its only Git remote is Lovable's internal project storage. There is no GitHub remote in this checkout. That is expected: Lovable pushes to GitHub from the platform side, not from this sandbox, so GitHub sync is enabled and driven through the Lovable UI rather than by Git commands I can run.

## What this means

I cannot run `git add`, `git commit`, or `git push` — Git state is managed by the platform, and manual Git commands here would not reach a GitHub repository. Getting the full codebase into GitHub is a one-time connect action you take in the Lovable UI, after which every change syncs automatically in both directions.

## Steps

1. **Connect the project to GitHub (you do this once)**
   - In the Lovable editor, open the **Plus (+) menu** in the chat input (bottom left) → **GitHub** → **Connect project**.
   - Authorize the Lovable GitHub App.
   - Pick the GitHub account or organization that should own the repository.
   - Click **Create Repository**.

   This pushes the entire current codebase — every file in the project, including `src/`, `supabase/functions/`, and `supabase/migrations/` — as the initial commit on the default branch.

2. **Verify the push landed**
   - Open the new repository on GitHub and confirm the file tree contains `src/`, `supabase/functions/`, `supabase/migrations/`, `package.json`, and `index.html`.
   - Confirm the commit count and the default branch name.

3. **Ongoing sync (automatic after step 1)**
   - Every change I make in Lovable is committed and pushed to GitHub automatically.
   - Every push you make to GitHub syncs back into Lovable in real time.
   - No manual commit step is needed from either side.

## What does NOT go to GitHub

- **Database contents.** The repository carries schema migrations under `supabase/migrations/`, but not the rows in your tables. A data export is separate: **Cloud → Advanced settings → Export data**.
- **Secrets.** Backend secrets and edge-function environment variables stay in Lovable Cloud and are never written into the repository. After cloning, anyone running the project locally has to supply their own values.

## If the project is already connected

If the Plus menu shows the project as already connected to a GitHub repository, then the financial-source-of-truth work from the previous turn is already pushed and no action is needed — open the repository and check the latest commit timestamp to confirm.

## Technical notes

- Git sync is bidirectional and commit-per-change; there is no batching or manual staging.
- Only one GitHub account can be linked to a Lovable account at a time.
- Branch switching is experimental and off by default (Account Settings → Labs → GitHub Branch Switching).
- As an alternative to GitHub, a paid workspace can download the code directly: open the Code Editor and click **Download codebase** at the bottom of the file tree.
