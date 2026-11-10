// A stand-in for the Claude Messages API: answers each meter photo or payment file from data.mjs, so the
// real app reads, dates and counts the demo folder without sending anything anywhere.
//   node mock-reader.mjs [port]      (the app: BILLS_ANTHROPIC_BASE_URL=http://127.0.0.1:<port>)
import http from "node:http";
import { PHOTOS, PAYMENTS } from "./data.mjs";

const port = Number(process.argv[2]) || 4311;
const byFile = new Map([...PHOTOS, ...PAYMENTS].map((e) => [e.file, e]));

// Tokens like a real photo (README: about 2,600 in and 150 out), a little different each time
let n = 0;
const usage = () => ({ input_tokens: 2590 + ((n * 37) % 60), output_tokens: 140 + ((n++ * 13) % 24), cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      if (req.method !== "POST" || !req.url.endsWith("/v1/messages")) {
        res.writeHead(404).end();
        return;
      }
      const body = JSON.parse(raw);
      const text = body.messages[0].content.find((c) => c.type === "text").text;
      const file = /<file_name>(.*?)<\/file_name>/.exec(text)?.[1] ?? "";
      const isPayment = body.output_config.format.schema.required.includes("paid_at");
      const e = byFile.get(file);
      let answer;
      if (isPayment) {
        const r = e?.reads ?? {};
        answer = { kind: r.paid_at ? "payment" : "other", paid_at: r.paid_at ?? "", kwh: r.kwh ?? 0, amount: r.amount ?? 0, currency: r.currency ?? "", confidence: "high", note: "" };
      } else {
        const r = e?.reads ?? { kind: "other", kwh: 0 };
        answer = { kind: r.kind, kwh: r.kwh, display_code: "", confidence: r.confidence ?? "high", note: r.note ?? "" };
      }
      console.log(`${isPayment ? "payment" : "photo  "} ${file} → ${JSON.stringify(answer)}`);
      res.writeHead(200, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          id: `msg_demo_${n}`,
          type: "message",
          role: "assistant",
          model: body.model,
          content: [{ type: "text", text: JSON.stringify(answer) }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: usage(),
        }),
      );
    });
  })
  .listen(port, "127.0.0.1", () => console.log(`mock reader on http://127.0.0.1:${port}`));
