/**
 * The OAuth callback is hit by the system browser following the provider's
 * redirect, not by the app itself (the app is polling status/:sessionId in
 * the background) — so it needs to render something a human reading it in a
 * browser tab understands, rather than returning JSON.
 */
export function oauthResultPage(ok: boolean, message: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Пульс</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center; justify-content: center;
           height: 100vh; margin: 0; background: #fafafa; color: #1a1a1a; text-align: center; padding: 24px; }
    .icon { font-size: 48px; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div>
    <div class="icon">${ok ? '✅' : '⚠️'}</div>
    <p>${message}</p>
  </div>
</body>
</html>`;
}
