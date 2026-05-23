---
"@runfusion/fusion": patch
---

Dashboard board no longer squeezes all 6 columns into the visible width on tablet-sized viewports (769–1024px). Columns now keep a 260px minimum and the board scrolls horizontally, matching desktop behavior. Previously the tablet rule used `minmax(0, 1fr)` with `overflow-x: hidden`, collapsing columns to ~130–170px wide on Android tablets and forcing task card titles to stack one word per line.
