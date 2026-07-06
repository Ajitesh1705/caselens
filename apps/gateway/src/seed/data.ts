// Synthetic, clearly-fictional seed data for the "Meridian" financial-fraud
// case. No real PII. The heuristic extractor keys off names, phone numbers,
// account/IBAN tokens, and leading timestamps on each line.

export const MERIDIAN_CASE = {
  title: "Operation Meridian",
  description:
    "Suspected layering of illicit funds through an offshore account. Fictional demo case.",
  status: "active" as const,
};

// Ingested at boot so the console opens partially populated.
export const BOOT_EVIDENCE = [
  {
    filename: "whatsapp_export_mehta.txt",
    type: "chat",
    content: [
      "2026-03-01 09:14 Rohit Mehta: Priya Nair we need to move the funds before audit",
      "2026-03-01 09:16 Priya Nair: use account GB29NWBK60161331926819 like last time",
      "2026-03-02 22:03 Rohit Mehta: Daniel Osei will confirm on +44 7700 900431",
      "2026-03-02 22:10 Daniel Osei: confirmed, routing via Meridian Holdings",
      "2026-03-03 08:40 Rohit Mehta: send to acct 4471120098 first, then offshore",
    ].join("\n"),
  },
  {
    filename: "call_detail_records.txt",
    type: "call_record",
    content: [
      "2026-03-03 11:22 Rohit Mehta called Daniel Osei +44 7700 900431 duration 320s",
      "2026-03-03 15:05 Priya Nair called +44 7700 900118 duration 95s",
      "2026-03-04 09:47 Daniel Osei called Rohit Mehta +44 7700 900902 duration 610s",
      "2026-03-05 18:31 Rohit Mehta emailed rohit.mehta@meridianholdings.example",
    ].join("\n"),
  },
];

// Fired via the webhook during the live demo (the "smoking gun" ledger).
export const DEMO_WEBHOOK_EVIDENCE = {
  filename: "transaction_ledger_offshore.txt",
  type: "transaction",
  content: [
    "2026-03-04 14:12 Rohit Mehta transferred USD 240,000 to account GB29NWBK60161331926819",
    "2026-03-04 14:19 Priya Nair transferred USD 90,000 to acct 4471120098",
    "2026-03-04 16:55 Daniel Osei moved USD 240,000 from GB29NWBK60161331926819 to KW81CBKU0000000000001234560101",
    "2026-03-05 02:40 Rohit Mehta contacted offshore desk +44 7700 900902 re KW81CBKU0000000000001234560101",
  ].join("\n"),
};
