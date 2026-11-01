# Deploying Family Wishes

This guide takes Family Wishes from your laptop to always-on hosting:

| Piece | Where | Cost |
| --- | --- | --- |
| Database | Supabase, region `ap-south-1` (Mumbai) | Free plan |
| Website (`apps/web`) | Vercel | Hobby plan |
| Worker (`apps/worker`) | Oracle Cloud Always Free VM, in Docker | Free |

Do the [local setup in the README](../README.md#run-it-locally) first, and run the **verification checklist** at the end of this guide with a test number and a test group *before* you deploy.

> **Only one worker at a time.** The WhatsApp login lives in the database. Two workers using it at once (say, your laptop and the VM) keep kicking each other off. Stop the local worker before you start the one on the VM.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com) in region **South Asia (Mumbai) `ap-south-1`**. Save the database password somewhere safe.
2. Open **Connect** → **Transaction pooler** and copy the URI (port **6543**). This is `DATABASE_URL` for both the website and the worker. The pooler works over IPv4, which the Oracle VM and Vercel need. If the password contains `@`, `#` or `/`, percent-encode it.
3. Create the tables from your laptop:

   ```powershell
   $env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
   npm run db:migrate
   ```

   It prints the migrations it applied and is safe to run again. Every table has row-level security on with no policies, so Supabase's public API keys can't read them.

Free Supabase projects pause after a week without activity. The worker queries the database every few seconds, so a running worker keeps the project awake.

## 2. Vercel (website)

1. In Vercel, **Add New → Project** and import the GitHub repository.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and installs from the repository root's `package-lock.json`, so the shared `packages/*` are included.
3. Under **Settings → Build and Deployment**, set **Node.js Version** to **24.x**.
4. Under **Settings → Functions**, set the region to **Mumbai (`bom1`)** so the website sits next to the database.
5. Add these **Environment Variables** (Production):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | The transaction pooler URI from step 1 |
   | `ADMIN_PHONE` | Admin's WhatsApp number, digits only, e.g. `919876543210` |
   | `ADMIN_PASSWORD` | At least 16 characters |
   | `SESSION_SECRET` | At least 32 random characters, e.g. `openssl rand -base64 48` |
   | `GEMINI_API_KEY` | Used by **Write again** on the Drafts page, and for Gemini cards |
   | `GEMINI_MODEL` | Optional, default `gemini-3.5-flash-lite` |
      | `POLLINATIONS_API_KEY` | Optional. Set it if the worker uses Pollinations, so **New card** / **Make a card** on the Drafts page does too |
   | `POLLINATIONS_IMAGE_MODEL`, `GEMINI_IMAGE_MODEL` | Optional, same meaning as in the README |

6. **Deploy**. Open the deployment URL and check that `/login/admin` loads and the admin password signs you in.

If the website shows `Invalid web environment`, the message names the variable to fix. Redeploy after changing environment variables.

## 3. Oracle Cloud VM (worker)

### Get a free Oracle Cloud account

1. Sign up at [oracle.com/cloud/free](https://www.oracle.com/cloud/free/) with your email, phone number and a card in your own name. The card is only verified with a small temporary hold. Some Indian debit cards are declined; a credit card usually works.
2. Pick the **home region** carefully: Always Free VMs can only be created there and it can't be changed later. **India West (Mumbai)** sits next to Supabase; **India South (Hyderabad)** is a good fallback if Mumbai often has no free capacity. The worker isn't latency-sensitive, so either is fine.
3. You get a 30-day trial with credits, then the account continues on **Always Free**. Always Free Ampere A1 is **2 OCPUs and 12 GB of memory in total** (Oracle halved it from 4 OCPUs / 24 GB in 2026). The 1 OCPU / 6 GB VM below fits easily.

> **Idle VMs get reclaimed.** Oracle may reclaim an Always Free instance if, over 7 days, its 95th-percentile CPU, network and memory use are all under 20%. The worker is light, so it can look idle. To avoid this, upgrade the account to **Pay As You Go**: Always Free resources stay free, and you pay only for anything above the free limits. Set a small budget alert under **Billing → Budgets** in case something non-free gets created by mistake. Upgrading also helps with "out of host capacity" errors.

### Create the VM

1. In the Oracle Cloud console, **Compute → Instances → Create instance**.
2. **Image and shape**: change the image to **Canonical Ubuntu 24.04**, and the shape to **Ampere → VM.Standard.A1.Flex** with **1 OCPU and 6 GB** memory. The shape shows an *Always Free-eligible* label.
3. **Networking**: let it create a new virtual cloud network with a public subnet, and keep **Assign a public IPv4 address** on.
4. **SSH keys**: either let Oracle generate a key pair and **download the private key**, or paste your own public key (`Get-Content ~\.ssh\id_ed25519.pub` after `ssh-keygen -t ed25519` on Windows).
5. **Boot volume**: keep the default (about 47 GB; Always Free includes 200 GB in total). Press **Create**.
6. Leave the default security list: **SSH (22) only**. The worker makes outgoing connections only and needs no open ports.

If you get **"Out of host capacity"**, try the other availability domains in the *Placement* section, try again later (nights and weekends work better), or upgrade to Pay As You Go.

When the instance is *Running*, copy its **Public IP address** from the instance page.

### Install Docker

SSH in and install Docker Engine with the Compose plugin. From Windows PowerShell, with a key Oracle generated for you:

```powershell
# OpenSSH refuses keys other users can read, so lock the file down once
icacls C:\path\to\ssh-key.key /inheritance:r /grant:r "$($env:USERNAME):(R)"
ssh -i C:\path\to\ssh-key.key ubuntu@<public-ip>
```

(With your own key in `~\.ssh`, plain `ssh ubuntu@<public-ip>` works.) Then, on the VM:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so `docker` works without `sudo`, then check with `docker compose version`.

### Get the code and configure it

```bash
git clone https://github.com/mudit9999/Birthday-wish.git family-wishes
cd family-wishes/deploy/worker
```

If the repository is private, clone with a read-only [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys) or a fine-grained token that can only read this repository.

Create `deploy/worker/.env` (git-ignored) and lock it down:

```bash
nano .env
chmod 600 .env
```

```text
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres
ADMIN_PHONE=919876543210
GEMINI_API_KEY=...
# Optional
# GEMINI_MODEL=gemini-3.5-flash-lite
# GEMINI_IMAGE_MODEL=gemini-3.1-flash-image
# POLLINATIONS_API_KEY=sk_...
# POLLINATIONS_IMAGE_MODEL=tongyi-mai/z-image-turbo
# LOG_LEVEL=info
```

Leave `BACKUP_DIR` unset. Inside the container it defaults to `/data/backups`, which is `deploy/worker/data/backups` on the VM.

The container runs as the `node` user (uid 1000). Create the data folder yourself first. If Docker creates it, root owns it and backups fail:

```bash
mkdir -p data/backups
sudo chown -R 1000:1000 data
```

### Start it

```bash
docker compose up -d --build
docker compose logs -f
```

The first build takes a few minutes on the A1 shape. The log should show the worker starting and waiting for a WhatsApp link. Press `Ctrl+C` to stop following the log; the worker keeps running and restarts on reboot (`restart: unless-stopped`).

### Day-to-day

| Task | Command (in `deploy/worker`) |
| --- | --- |
| Follow the log | `docker compose logs -f` |
| Update to the latest code | `git pull && docker compose up -d --build` |
| Apply new database migrations | `docker compose run --rm worker npx tsx packages/db/src/migrate.ts` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Backups | `ls data/backups` (one JSON file per night at 02:00) |

Run the migration command after a `git pull` that adds files under `supabase/migrations`, before restarting the worker. Redeploy the website too; Vercel does this by itself when you push.

## 4. Link WhatsApp

1. Sign in at `https://<your-vercel-domain>/login/admin`.
2. Open **Admin → WhatsApp** and scan the QR code from the phone (WhatsApp → **Linked devices** → **Link a device**).
3. When it shows *Connected*, pick the group. Use the **test group** first.
4. Under **Admin → Members**, add the family's numbers so they can sign in.

The link is stored in the database, so restarts and updates reconnect without a new QR code.

### Switching from the test number to the real one

The linked WhatsApp account must be the admin's own number (`ADMIN_PHONE`): drafts arrive in its *Message yourself* chat, and replies from there approve them.

1. Change `ADMIN_PHONE` in Vercel (then redeploy) and in `deploy/worker/.env` (then `docker compose up -d` to recreate the container with it).
2. On the test phone, open WhatsApp → **Linked devices** and log the Family Wishes device out. The worker notices, clears the old link and shows a new QR code.
3. Sign in at `/login/admin` again, scan the QR code with the real phone, and pick the family group.

The test number stays on the member list as an admin. If it isn't a number you control, delete its row from the `members` table in Supabase's Table Editor.

## 5. Verification checklist

Do steps 1–6 locally against Supabase with a **test WhatsApp number** and a **test group** of 2–3 numbers. After deploying, repeat steps 3–5 on Vercel and the VM (step 7). Paste the results into the pull request.

- [ ] **1. Tests.** `npm test` (unit and integration) and `npm run e2e` (Playwright smoke test) pass.
- [ ] **2. Link.** Web (`next dev`) and worker (`npm run worker:dev`) run locally against Supabase. The test number links by QR on the WhatsApp page, and the test group is picked.
- [ ] **3. Sign in and add.** From a phone, sign in with a code that arrives on WhatsApp, then add a birthday for tomorrow.
- [ ] **4. Draft and reply.** On the WhatsApp page, press **Draft tomorrow’s wishes**. The draft arrives in the admin's *Message yourself* chat with no age in it. Reply `redo` (a new wish arrives), then send your own text (the draft changes to it), then `ok` (approved).
- [ ] **5. Post once.** Press **Post approved wishes**. Exactly one message lands in the test group and the Drafts page marks it **Posted**. Pressing the button again doesn't post it a second time.
- [ ] **6. Nothing unapproved posts.** Leave a draft unapproved. The morning reminder arrives at the nudge time, and nothing posts at the send time.
- [ ] **7. Production.** Deploy the website to Vercel and the worker to the VM (stop the local worker first). Repeat steps 3–5 there, then switch to the real number and the family group (section 4).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| QR never appears on the WhatsApp page | `docker compose logs -f` on the VM. Check the worker's `DATABASE_URL` is the same database the website uses. |
| The worker keeps disconnecting with "replaced" or "conflict" | Another worker is using the same link. Stop the one on your laptop. |
| `EACCES` writing backups | `sudo chown -R 1000:1000 deploy/worker/data` |
| Vercel build fails installing packages | Root Directory must be `apps/web` and `package-lock.json` must be committed at the repository root. |
| `Invalid worker environment` in the log | Fix the variable it names in `deploy/worker/.env`, then `docker compose up -d`. |

See also the [README troubleshooting table](../README.md#troubleshooting).
