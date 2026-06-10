# GamePulse Userscript

Install `src/gamepulse.user.js` in Tampermonkey or Violentmonkey.

The script injects a small `采集到 GamePulse` button on supported community pages. It reads visible text from the current page, maps it to GamePulse ingest items, and posts to `http://localhost:4317/api/ingest/batch`.

It does not read cookies, does not store account credentials, and does not crawl in the background.

Before using it, create a project in the GamePulse dashboard and paste its project ID into the prompt shown by the script.

