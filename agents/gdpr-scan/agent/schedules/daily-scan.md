---
cron: "0 6 * * 1-5"
---

Run the full_scan skill against https://wander.com and the pilot merchant
sites list (spike: just wander.com until the merchant registry feed exists).
If any 🔴 or 🟠 finding appears that wasn't in the previous run's report,
lead the report with a "NEW FINDINGS" section.
