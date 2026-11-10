# Frequently asked questions

Short answers to the questions that come up most. The [README](README.md) has the full details; if your question isn't here, [open an issue](https://github.com/jochristianto/personal-file-map/issues/new/choose).

- [Naming your files](#naming-your-files)
  - [What's the basic pattern?](#whats-the-basic-pattern)
  - [How do I number files: `#1` or `1`?](#how-do-i-number-files-1-or-1)
  - [I paid the same bill twice in one month](#i-paid-the-same-bill-twice-in-one-month)
  - [One payment has several documents](#one-payment-has-several-documents)
  - [How do I name electricity meter photos?](#how-do-i-name-electricity-meter-photos)
  - [Two different bills end up as one](#two-different-bills-end-up-as-one)
  - [How are bills grouped in the report?](#how-are-bills-grouped-in-the-report)
  - [Which files are skipped?](#which-files-are-skipped)
  - [Does the app rename my files?](#does-the-app-rename-my-files)
  - [I used the old `01 Photo 1` names](#i-used-the-old-01-photo-1-names)
- [Using the app](#using-the-app)
- [Electricity meters](#electricity-meters)
- [Privacy](#privacy)
- [Getting help](#getting-help)

## Naming your files

### What's the basic pattern?

```
YYYYMM Name.ext
```

- `YYYYMM`: the year and month the bill belongs to, e.g. `202603` for March 2026. That's the month it's counted in, whatever date the file was saved.
- a space
- `Name`: anything. The same name in different months is the same bill.
- `.ext`: `pdf`, `png`, `jpg`, `jpeg` or `heic`.

```
202601 Rent.pdf
202603 Internet Payment.jpg
202604 Insurance Car.pdf
```

Case doesn't matter (`internet payment` and `Internet Payment` are the same bill), and extra spaces are tolerated.

### How do I number files: `#1` or `1`?

A bill's name ends at the first number after it, and **the kind of number says what the file is**:

| Write | It means | Example | The app sees |
|---|---|---|---|
| `#1`, `#2`, … | **separate payments** (or top-ups) of this bill in the month | `Klaska PLN #1 Before.jpg`, `Klaska PLN #2 Before.jpg` | bill *Klaska PLN*, **2 payments** that month |
| `1`, `2`, … | **documents or steps of one payment** | `PBB Klaska 1 SPPT.pdf`, `PBB Klaska 2 Payment.pdf`, `PBB Klaska 3 Lunas.pdf` | bill *PBB Klaska*, **1 payment** |
| `#2 1`, … | a document of a particular payment | `PBB Klaska #2 1 SPPT.pdf` | bill *PBB Klaska*, payment 2 |
| neither | just the bill | `Rent.pdf` | bill *Rent*, 1 payment |

In short: **`#` counts, a plain number sorts.** Use `#` only when money changed hands more than once that month.

The rules behind it:

- The number is 1 or 2 digits and a word of its own: `#1`, `#01` and `#12` work; `PLN#1` (no space) or `#123` don't.
- `#1` and `#01` are the same payment.
- The first word is never cut off, so `2 Rent` stays the bill *2 Rent*.
- Longer numbers don't end the name: `Internet 2026 Plan` is the bill *Internet 2026 Plan*.
- `Photo` (or `Foto`) also ends the name: `Klaska PLN Photo 4.jpg` is the bill *Klaska PLN*.
- Whatever comes after the number is a description for you: `Before`, `Receipt`, `SPPT`, `Lunas`.

### I paid the same bill twice in one month

Give each payment its own `#`:

```
202605 Water #1 Receipt.pdf
202605 Water #2 Receipt.pdf
```

The settings window shows a small **2** on May for *Water*, and the report's matrix shows a small *2* next to the checkmark. Without the `#`, both files would count as one payment.

### One payment has several documents

Number them with plain numbers, or don't number them at all:

```
202601 PBB Klaska 1 SPPT.pdf
202601 PBB Klaska 2 Payment.jpg
202601 PBB Klaska 3 Lunas.pdf
```

That's one bill, *PBB Klaska*, paid once in January. A `.pdf` and a `.jpg` of the same bill in the same month also count once.

### How do I name electricity meter photos?

One `#` per top-up, then what the photo shows:

```
202610 Klaska PLN #1 Before.jpg     the credit left, just before topping up
202610 Klaska PLN #1 Input.jpg      the kWh just added (meter screen after the token, or the receipt)
202610 Klaska PLN #1 After.jpg      the credit right after topping up
202610 Klaska PLN #2 Before.jpg     a second top-up the same month
```

Keep the original photos: the time each one was taken is read from the photo itself, and screenshots or copies sent through a chat app lose it. The settings window shows these example names for the current month and your meter under **Electricity meters**. See [Electricity meters](README.md#electricity-meters) in the README.

### Two different bills end up as one

That happens when a number or `Photo` cuts the name short: `Phone 1 Home` and `Phone 2 Work` are both the bill *Phone*. Put the distinguishing word before any number:

```
202603 Phone Home.pdf
202603 Phone Work.pdf
```

### How are bills grouped in the report?

By their **first word**: `Insurance Car` and `Insurance Health` are listed under *Insurance*. A schedule set for `Insurance` in the settings window covers every bill that starts with it, unless a longer name (e.g. `Insurance Car`) has its own.

### Which files are skipped?

Files that don't start with `YYYYMM`, have a month outside 01–12 (`202600`), belong to a different year than the folder, or have an unsupported extension. They're never deleted; the report lists each one with the reason under *Housekeeping* on page 1.

The year comes from the folder's name when it's like `2026`, otherwise from the file names. Keep one folder per year.

### Does the app rename my files?

Only two things, nothing else: uppercase extensions are lowercased (`IMG.JPG` → `IMG.jpg`), and `.heic` photos are converted to `.jpg` (the `.heic` is removed afterwards; an existing `.jpg` is never overwritten). Your names are never changed.

### I used the old `01 Photo 1` names

Older versions counted any number after the name as a payment, so meter photos were named like `Klaska PLN 01 Photo 1 Before.jpg`. Those files are still the bill *Klaska PLN*, but a plain `01` no longer counts as a payment. If you want a month with two top-ups to show **2**, rename them with `#`:

```
202610 Klaska PLN 01 Photo 1 Before.jpg   →   202610 Klaska PLN #1 Before.jpg
202610 Klaska PLN 02 Photo 1 Before.jpg   →   202610 Klaska PLN #2 Before.jpg
```

Meter readings aren't affected either way: the app tells top-ups apart by the times the photos were taken, and a renamed photo keeps its reading (it isn't sent to the AI reader again).

## Using the app

### Do I need to install anything?

No. Download the app for your system from the [Releases page](https://github.com/jochristianto/personal-file-map/releases/latest), copy it into your bills folder and double-click it. The runtime is inside the app.

### macOS or Windows says the app can't be opened

The app isn't signed with a paid Apple or Microsoft certificate, so both warn the first time. On macOS: **System Settings → Privacy & Security → Open Anyway**. On Windows: **More info → Run anyway**. See [First launch](README.md#first-launch).

### Where are my settings saved?

In `config.local.json` next to the app, written when you click **Save** or **Generate report**. Nothing is written before that. For a new year, copy the app and `config.local.json` into the new year's folder.

### What's the difference between *Save* and *Generate report*?

**Save** writes only your settings. **Generate report** saves them too, then writes `personal-file-map.output.pdf` and opens it.

### A bill shows as missing, but I paid it

Check its file name against [the pattern](#whats-the-basic-pattern): the month prefix decides where it's counted, and a typo in the name makes it a different bill. Then check its schedule: a bill set to *Monthly* is flagged for every month without a file. Use *Irregular* or *Not scheduled* for bills that never need flagging.

### The settings window doesn't appear

After a minute the app shows its address; open it in any browser. More fixes are in [Troubleshooting](README.md#troubleshooting).

## Electricity meters

### Do I need an AI subscription?

You need an **API key** with credit from Anthropic (Claude) or OpenAI (ChatGPT); a ChatGPT or Claude chat subscription alone doesn't include API access. *Create a key* in the settings window opens the provider's key page.

### What does it cost?

About $0.0003 a photo with the suggested `claude-haiku-5-5`. Each photo is read once, and the window and the report show the tokens and cost of every reading.

### A photo was read wrong

Fix the value in the *Meter readings* table of the settings window, or set it to *Ignore*, then generate again.

## Privacy

### Do my bills leave my computer?

No. The app works on the folder on your computer, has no analytics and doesn't check for updates. The links in the window's footer only open pages in your browser.

The one exception is opt-in: with an AI reader turned on, the photos of ⚡ bills (and only those) are sent to the provider you picked. See [what's sent, and what's kept where](README.md#electricity-meters).

### Is my API key safe?

It's stored in plain text in `config.local.json`. If that folder is synced (Google Drive, iCloud, Dropbox) or shared, the key goes with it, so remove it before sharing the folder.

## Getting help

- **Something doesn't work?** [Report an issue](https://github.com/jochristianto/personal-file-map/issues/new/choose) with the app version (shown at the bottom of the settings window) and, if you can, `last-run.log` from `~/Library/Application Support/Personal File Map/` (macOS) or `%APPDATA%\Personal File Map\` (Windows). Leave out anything private.
- **A security problem?** Please report it privately, see [SECURITY.md](SECURITY.md).
- **Want to help?** See [CONTRIBUTING.md](CONTRIBUTING.md).
