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
  - [My meter photos have no date (sent through WhatsApp, or screenshots)](#my-meter-photos-have-no-date-sent-through-whatsapp-or-screenshots)
  - [I only have the payment, no meter photos](#i-only-have-the-payment-no-meter-photos)
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
| `#1`, `#2`, … | **separate payments** (or top-ups) of this bill in the month | `Home Meter #1 Before.jpg`, `Home Meter #2 Before.jpg` | bill *Home Meter*, **2 payments** that month |
| `1`, `2`, … | **documents or steps of one payment** | `Property Tax 1 Assessment.pdf`, `Property Tax 2 Payment.pdf`, `Property Tax 3 Receipt.pdf` | bill *Property Tax*, **1 payment** |
| `#2 1`, … | a document of a particular payment | `Property Tax #2 1 Assessment.pdf` | bill *Property Tax*, payment 2 |
| neither | just the bill | `Rent.pdf` | bill *Rent*, 1 payment |

In short: **`#` counts, a plain number sorts.** Use `#` only when money changed hands more than once that month.

The rules behind it:

- The number is 1 or 2 digits and a word of its own: `#1`, `#01` and `#12` work; `PLN#1` (no space) or `#123` don't.
- `#1` and `#01` are the same payment.
- The first word is never cut off, so `2 Rent` stays the bill *2 Rent*.
- Longer numbers don't end the name: `Internet 2026 Plan` is the bill *Internet 2026 Plan*.
- `Photo` (or `Foto`) also ends the name: `Home Meter Photo 4.jpg` is the bill *Home Meter*.
- Whatever comes after the number is a description for you: `Before`, `Receipt`, `Assessment`, `Receipt`.

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
202601 Property Tax 1 Assessment.pdf
202601 Property Tax 2 Payment.jpg
202601 Property Tax 3 Receipt.pdf
```

That's one bill, *Property Tax*, paid once in January. A `.pdf` and a `.jpg` of the same bill in the same month also count once.

### How do I name electricity meter photos?

One `#` per top-up, then what the photo shows:

```
202610 Home Meter #1 Before.jpg     the credit left, just before topping up
202610 Home Meter #1 Input.jpg      the kWh just added (meter screen after the token, or the receipt)
202610 Home Meter #1 After.jpg      the credit right after topping up
202610 Home Meter #1 Payment.jpg    optional: the bank transfer (for the date)
202610 Home Meter #1 Payment Receipt.jpg   optional: the token receipt (for the kWh bought)
202610 Home Meter #2 Before.jpg     a second top-up the same month
```

**Only photos named `Before`, `Input` or `After` are meter photos.** That word also tells the app what the photo shows: `Before` and `After` are the credit left, `Input` is the kWh just added. Two more files of a top-up can help, and are only read when the photos don't tell: `… Payment` (the bank transfer) for the date, and `… Payment Receipt` (the token receipt) for the kWh bought. Neither is a reading. Any other file of the meter's bill, such as a receipt PDF, is left out: it isn't listed under *Meter readings*, isn't sent to the AI reader and isn't counted.

Keep the original photos: the time each one was taken is read from the photo itself, and screenshots or copies sent through a chat app lose it. If they have, see [My meter photos have no date](#my-meter-photos-have-no-date-sent-through-whatsapp-or-screenshots). The settings window shows these example names for the current month and your meter under **Electricity meters**. See [Electricity meters](README.md#electricity-meters) in the README.

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

Older versions counted any number after the name as a payment, and named the meter photos `Photo 1 Before`, `Photo 2 Topup` and `Photo 3 After`. Rename them like this:

```
202610 Home Meter 01 Photo 1 Before.jpg   →   202610 Home Meter #1 Before.jpg
202610 Home Meter 01 Photo 2 Topup.jpg    →   202610 Home Meter #1 Input.jpg
202610 Home Meter 01 Photo 3 After.jpg    →   202610 Home Meter #1 After.jpg
202610 Home Meter 02 Photo 1 Before.jpg   →   202610 Home Meter #2 Before.jpg
```

- **`Topup` must become `Input`.** A photo without `Before`, `Input` or `After` in its name is no longer a meter photo, so until it's renamed that top-up's amount is missing (the app works it out from the before and after photos where it can).
- **`01` must become `#1`** if you want a month with two top-ups to show **2** in the bill list and the matrix. A plain `01` no longer counts as a payment. The Electricity pages aren't affected: they tell top-ups apart by the times the photos were taken.
- A renamed photo keeps its reading and isn't sent to the AI reader again; the app recognises it by its content.

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

### Which photos are sent to the AI?

Only photos of ⚡ bills whose names contain `Before`, `Input` or `After`, each once, scaled down. The only additions are a top-up's `Payment` and `Payment Receipt` files, each once, and only when its photos don't give what's needed: the `Payment` file when the photos have no capture date (or there are none), the `Payment Receipt` when there's no `Input` photo and the kWh bought can't be worked out from `Before` and `After`. Nothing else from the folder is ever sent: not other bills, not PDFs, not other files of the meter's bill (`Receipt`, `Check`, …). Every request is recorded in the `logs` folder next to the app, so you can see exactly which photos went out.

### A meter photo isn't listed under *Meter readings*

Its name has no `Before`, `Input` or `After`, so it isn't treated as a meter photo (see [How do I name electricity meter photos?](#how-do-i-name-electricity-meter-photos)). Rename it, and it shows up and can be read. Also check that the ⚡ is on for the bill it belongs to.

### A photo was read wrong

Fix the value in the *Meter readings* table of the settings window, or set it to *Ignore*, then generate again. What a photo shows (credit left or kWh added) comes from its name; if that's wrong, fix the name, or pick the right one in the table.

### My meter photos have no date (sent through WhatsApp, or screenshots)

A photo sent through a chat app, saved from one, or screenshotted loses its capture date. The app then only knows the month from the file name: the kWh used between top-ups is still exact, but the days in between, the kWh a day and the next top-up date can't be worked out. The window marks such photos † (only the month) or * (the file's own date, which may just be when you saved it).

**Workaround: add the payment.** You top up on the same day you pay, so the payment's date is the top-up's date. Save the bank transfer or e-wallet screenshot of each top-up next to its photos, with the same month and `#`, and a name that ends in `Payment`:

```
202609 Home Meter #1 Before.jpg      no capture date
202609 Home Meter #1 Input.jpg       no capture date
202609 Home Meter #1 After.jpg       no capture date
202609 Home Meter #1 Payment.jpg     bank transfer screenshot, paid 12 Sep 2026 18:40
```

- **The readings don't change.** The *Meter readings* table still lists only the Before, Input and After photos, and only they give kWh. The Payment file isn't a reading.
- **It's only read when needed.** When at least one photo of that top-up has no capture date, the AI reader reads the date and time on the Payment file, once (with **Read new photos** or **Generate report**). A top-up whose photos all have a capture date never sends its Payment file.
- **The photos get the payment's date.** Those without a capture date are placed at the payment's time, a minute apart: Before just before it, then Input and After. They're marked ‡ in the window (§ in the PDF); hover the time to see which Payment file it came from. Photos with their own capture date keep it.
- **Matching:** the same meter, month and `#N`. A month with a single top-up and a single Payment file can leave out the `#`. A payment dated more than a month away from the month in its file name isn't used.
- **The name ends in `Payment`.** A `… Payment Receipt` is read for its date only when there's no `… Payment` file, or when it's read anyway for its kWh (see below).
- **Correcting it:** the date read is kept in `personal-file-map.readings.json` under `"payments"`. Change `"paidAt"` (`YYYY-MM-DDTHH:MM:SS`) and set `"edited": true`, or delete the entry to have it read again.
- The screenshot shows what your bank shows on it (the account paid, your masked account, a reference number), and it's sent to the AI provider you picked. Crop it to the date if you'd rather not send the rest.

### I only have the payment, no meter photos

The top-up still counts. Name its files like the photos would be, with the same month and `#`:

```
202608 Home Meter #2 Payment.jpg            the bank transfer: when it was paid
202608 Home Meter #2 Payment Receipt.jpg    the token receipt: the kWh bought
```

- It's a row in the report's **top-ups table**, on the payment's date (from the `Payment` file, or the receipt when it has the date; with neither, mid-month).
- **The kWh topped up** comes from the `Payment Receipt`. Without one, it's worked out from the usage around it when possible, and marked as estimated; otherwise it shows `?`.
- **The credit before and after are estimated,** shown with `~`. With photos of the top-ups on both sides, the kWh used between them stays exact (credit after the previous top-up + kWh bought − credit before the next), and is split between the two stretches by time. With a photo on one side only, it's worked out at your usual kWh a day.
- Only what's needed is read: the receipt first, and the `Payment` file only if the receipt has no date.

The same receipt also fills in for a top-up that has photos but no `Input` photo, when the kWh can't be worked out from a `Before` and an `After` photo.

## Privacy

### Do my bills leave my computer?

No. The app works on the folder on your computer, has no analytics and doesn't check for updates. The links in the window's footer only open pages in your browser.

The one exception is opt-in: with an AI reader turned on, the photos of ⚡ bills named `Before`, `Input` or `After` (and a top-up's `Payment` or `Payment Receipt` file, only when its photos don't give the date or the kWh) are sent to the provider you picked. See [what's sent, and what's kept where](README.md#electricity-meters).

### Is my API key safe?

It's stored in plain text in `config.local.json`. If that folder is synced (Google Drive, iCloud, Dropbox) or shared, the key goes with it, so remove it before sharing the folder.

## Getting help

- **Something doesn't work?** [Report an issue](https://github.com/jochristianto/personal-file-map/issues/new/choose) with the app version (shown at the bottom of the settings window) and, if you can, `last-run.log` from `~/Library/Application Support/Personal File Map/` (macOS) or `%APPDATA%\Personal File Map\` (Windows). Leave out anything private.
- **A security problem?** Please report it privately, see [SECURITY.md](SECURITY.md).
- **Want to help?** See [CONTRIBUTING.md](CONTRIBUTING.md).
