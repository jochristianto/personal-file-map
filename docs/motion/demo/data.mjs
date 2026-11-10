// The demo folder's electricity meter: the README's and FAQ's Home Meter example, one top-up per row.
// Every number the video shows about electricity comes from here, through the real app.
//
//   reads:  what the mock reader answers for that file (kWh on the display, or the payment)
//   at:     the photo's EXIF capture time; null = no capture date (sent through a chat app)
//   fix:    what the window's Meter readings table is set to afterwards (the video shows the edit)

export const METER = "Home Meter";

/** Local time, like a camera's EXIF stamp. */
const t = (s) => new Date(s);

export const PHOTOS = [
  // July: a normal top-up, photos with capture dates
  { file: "202607 Home Meter #1 Before.jpg", at: t("2026-07-04T19:12:00"), reads: { kind: "balance", kwh: 58.1 } },
  { file: "202607 Home Meter #1 Input.jpg", at: t("2026-07-04T19:13:00"), reads: { kind: "topup", kwh: 250 } },
  { file: "202607 Home Meter #1 After.jpg", at: t("2026-07-04T19:14:00"), reads: { kind: "balance", kwh: 308.1 } },
  // August #1
  { file: "202608 Home Meter #1 Before.jpg", at: t("2026-08-06T19:05:00"), reads: { kind: "balance", kwh: 64.2 } },
  { file: "202608 Home Meter #1 Input.jpg", at: t("2026-08-06T19:06:00"), reads: { kind: "topup", kwh: 250 } },
  { file: "202608 Home Meter #1 After.jpg", at: t("2026-08-06T19:07:00"), reads: { kind: "balance", kwh: 314.2 } },
  // September: sent through a chat app, no capture dates; the Payment file dates them (FAQ: 12 Sep 2026 18:40)
  { file: "202609 Home Meter #1 Before.jpg", at: null, reads: { kind: "balance", kwh: 7864, confidence: "medium" }, fix: { kind: "balance", kwh: 78.64 } },
  { file: "202609 Home Meter #1 Input.jpg", at: null, reads: { kind: "topup", kwh: 250 } },
  { file: "202609 Home Meter #1 After.jpg", at: null, reads: { kind: "balance", kwh: 328.64 } },
  // October #1: the README's 72.52 → 250.00 → 322.52, 32 days after September's After (18:42)
  { file: "202610 Home Meter #1 Before.jpg", at: t("2026-10-14T18:42:00"), reads: { kind: "balance", kwh: 72.52 } },
  { file: "202610 Home Meter #1 Input.jpg", at: t("2026-10-14T18:43:00"), reads: { kind: "topup", kwh: 250 } },
  { file: "202610 Home Meter #1 After.jpg", at: t("2026-10-14T18:44:00"), reads: { kind: "balance", kwh: 322.52 } },
  // October #2: glare over the digits, read wrong; set to Ignore in the window
  { file: "202610 Home Meter #2 Before.jpg", at: t("2026-10-29T07:58:00"), reads: { kind: "balance", kwh: 2.02, confidence: "low", note: "Glare covers part of the display." }, fix: { kind: "other", kwh: 0 } },
];

export const PAYMENTS = [
  { file: "202607 Home Meter #1 Payment.jpg", reads: { paid_at: "2026-07-04T19:10:00", kwh: 0, amount: 38.5, currency: "USD" } },
  { file: "202608 Home Meter #1 Payment.jpg", reads: { paid_at: "2026-08-06T19:03:00", kwh: 0, amount: 38.5, currency: "USD" } },
  // A top-up with only payment files (FAQ: "I only have the payment")
  { file: "202608 Home Meter #2 Payment.jpg", reads: { paid_at: "2026-08-26T09:15:00", kwh: 0, amount: 15.4, currency: "USD" } },
  { file: "202608 Home Meter #2 Payment Receipt.jpg", reads: { paid_at: "2026-08-26T09:16:00", kwh: 100, amount: 15.4, currency: "USD" } },
  { file: "202609 Home Meter #1 Payment.jpg", reads: { paid_at: "2026-09-12T18:40:00", kwh: 0, amount: 38.5, currency: "USD" } },
  { file: "202610 Home Meter #1 Payment.jpg", reads: { paid_at: "2026-10-14T18:41:00", kwh: 0, amount: 38.5, currency: "USD" } },
];

/** The schedules the report is made with (the window starts with every bill as monthly). */
export const BILLS = [
  ["Rent", "monthly"],
  ["Salary", "monthly"],
  ["Credit Card", "monthly"],
  ["Electricity", "monthly"],
  ["Water", "monthly"],
  ["Phone", "monthly"],
  ["Streaming", "monthly"],
  ["Gym", { every: 1, until: 5 }],
  ["Charity", null],
  ["Internet", { every: 1, from: 3 }],
  ["Insurance Car", "quarterly"],
  ["Insurance Health", "monthly"],
  ["Insurance Life", { months: [1, 7] }],
  ["Car Loan", { every: 1, from: 2 }],
  ["Mortgage", { every: 1, from: 3 }],
  ["HOA", "quarterly"],
  ["Groceries", "irregular"],
  ["Property Tax", { months: [1] }],
  [METER, "irregular"],
];

export const METERS = { bills: [METER], reader: "anthropic", models: { anthropic: "claude-haiku-5-5" } };

/** Fake, and never shown in full: the window only shows its last 4 characters. */
export const API_KEY = "sk-ant-demo-0000-0000-0000-7f3a";

/** Shown instead of the demo folder's real location. */
export const SHOWN_DIR = "/Users/demo/Bills/2026";
