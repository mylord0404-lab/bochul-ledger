# 보철 수납 장부 (Prosthetic Ledger PWA)

Static, offline-first PWA. No build step, no external requests; data lives only in the phone's localStorage.

Deploy: push this folder's contents to a GitHub repo and enable Pages (root). Works under `https://<user>.github.io/<repo>/` (all paths relative).
When you change any file later, bump `CACHE` in `sw.js` (e.g. `prosthetic-ledger-v1.0.1`) so installed phones pick up the update.
iPhone: open in Safari → 공유 → 홈 화면에 추가.
