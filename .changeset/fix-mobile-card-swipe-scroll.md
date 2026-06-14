---
"@runfusion/fusion": patch
---

Fixed unreliable horizontal scrolling when swiping across task cards on the mobile board. Native HTML5 drag is now disabled on touch-primary devices (where it never worked anyway), so the browser no longer hijacks swipe-to-scroll gestures that start on a card.
