/**
 * Vercel Serverless Function — /api/callback
 *
 * Recebe { code, codeVerifier } do callback.html (InfinityFree)
 * Troca pelo access_token junto à Deriv (server-side, seguro)
 * Devolve { token, account } ao browser
 *
 * Variáveis de ambiente — configurar em:
 * vercel.com → Projecto → Settings → Environment Variables
 *
 *   DERIV_CLIENT_ID     → 33FRi10GXPa68JkXZIewC
 *   DERIV_CLIENT_SECRET → (copiar do portal developers.deriv.com)
 *   DERIV_REDIRECT_URI  → https://sdejt-chemba.gt.tc/trade/callback.html
 *   ALLOWED_ORIGIN      → https://sdejt-chemba.gt.tc
 */

export default async function handler(req, res) {
  const ORIGIN = process.env.ALLOWED_ORIGIN || 'https://sdejt-chemba.gt.tc';

  // ── CORS ─────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Método não permitido.' });

  const { code, codeVerifier } = req.body || {};

  if (!code || !codeVerifier)
    return res.status(400).json({ error: 'code e codeVerifier são obrigatórios.' });

  try {
    // ── 1. Trocar authorization code por access_token ─────────────
    const tokenRes = await fetch('https://auth.deriv.com/oauth2/token', {
      method : 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body   : new URLSearchParams({
        grant_type   : 'authorization_code',
        client_id    : process.env.DERIV_CLIENT_ID,
        client_secret: process.env.DERIV_CLIENT_SECRET,
        code,
        code_verifier: codeVerifier,
        redirect_uri : process.env.DERIV_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[/api/callback] Deriv token error:', errText);
      return res.status(401).json({
        error: 'A Deriv recusou a troca do código.',
        detail: errText,
      });
    }

    const { access_token, expires_in } = await tokenRes.json();

    if (!access_token)
      return res.status(401).json({ error: 'access_token não recebido da Deriv.' });

    // ── 2. Obter info da conta (opcional mas útil para o dashboard) ─
    let accountId = 'conta';
    try {
      const profileRes = await fetch(
        'https://api.derivws.com/trading/v1/options/accounts',
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Deriv-App-ID' : process.env.DERIV_CLIENT_ID,
          },
        }
      );
      if (profileRes.ok) {
        const p = await profileRes.json();
        accountId = p?.accounts?.[0]?.account_id ?? p?.loginid ?? 'conta';
      }
    } catch (_) { /* não bloquear se falhar */ }

    // ── 3. Devolver token ao browser ──────────────────────────────
    // O token ficará em sessionStorage — dura até fechar o browser
    return res.status(200).json({
      token    : access_token,
      expiresIn: expires_in ?? 3600,
      account  : accountId,
    });

  } catch (err) {
    console.error('[/api/callback] Erro interno:', err);
    return res.status(500).json({ error: 'Erro interno do servidor Vercel.' });
  }
}
