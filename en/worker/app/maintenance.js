// Static maintenance page (503). It makes no D1/KV/R2/template calls, so it renders even while those are down.

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>We'll be right back</title>
<style>
  html,body{height:100%;margin:0}
  body{
    display:flex;align-items:center;justify-content:center;
    background:#0f1115;color:#f2f2f2;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    text-align:center;padding:24px;box-sizing:border-box;
  }
  .card{max-width:480px}
  h1{font-size:1.5rem;margin:0 0 12px}
  p{font-size:1rem;line-height:1.5;color:#c7c9d1;margin:0 0 8px}
  .badge{
    display:inline-block;margin-bottom:20px;padding:6px 14px;
    border-radius:999px;background:#1f232c;color:#9ea3af;
    font-size:.8rem;letter-spacing:.03em;text-transform:uppercase;
  }
</style>
</head>
<body>
  <div class="card">
    <span class="badge">Scheduled Maintenance</span>
    <h1>We're upgrading our system</h1>
    <p>We're making some improvements behind the scenes.</p>
    <p>Please check back in a few hours — thanks for your patience.</p>
  </div>
</body>
</html>`;

export function maintenanceResponse() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "7200",
    },
  });
}
