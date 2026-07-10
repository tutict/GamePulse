# GamePulse Userscript

Install `src/gamepulse.user.js` in Tampermonkey or Violentmonkey.

The script adds a `下载 GamePulse NDJSON` button to supported community pages. It reads visible comment text, removes duplicates, and downloads at most 500 records as an NDJSON file that the Windows or Android client can import.

The script does not call a localhost service, read cookies, store account credentials, or crawl in the background. Review the generated file before sharing it because it contains the visible comment text and source URL.
