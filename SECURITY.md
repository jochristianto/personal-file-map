# Security policy

Bills Overview reads folders full of financial documents, so we take security reports seriously.

## Supported versions

Only the **latest build** on the [Releases page](../../releases/latest) (built from `main`) gets fixes. If you use an older copy, update first and check whether the problem is still there.

## Reporting a vulnerability

**Please don't open a public issue for security problems.** Report them privately:

1. Go to the repository's **Security** tab → **Report a vulnerability** ([direct link](../../security/advisories/new)).
2. Describe the problem, how to reproduce it, which app and OS you used, and what an attacker could do with it.

You'll get a reply within 7 days. We'll keep you updated, agree on a disclosure date with you, and credit you in the release notes if you'd like.

## What counts

Examples of things we want to hear about:

- Another website or local program being able to reach the settings window's server (it listens on `127.0.0.1` with a random port and a random token).
- The app reading, changing or deleting files outside the bills folder and its own settings folder.
- The app sending anything over the network.
- A crafted bill file (PDF, JPG, PNG, HEIC) or `config.local.json` that makes the app run code.
- Problems in the build or release workflow that could let someone tamper with the published apps.

Not in scope: the apps not being notarized or signed with a paid certificate (a known limitation, see [First launch](README.md#first-launch)), and issues that need someone who already controls your user account.
