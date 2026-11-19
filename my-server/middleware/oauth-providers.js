// =====================================================================
// Đăng nhập bằng Google / Facebook (OAuth 2.0)
// =====================================================================

class OAuthError extends Error {}

const PROVIDERS = {
  google: {
    label: 'Google',
    configured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    authorizeUrl({ redirectUri, state }) {
      const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    },
    async profile({ code, redirectUri }) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokens = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokens.access_token) throw new OAuthError('Google không xác nhận được đăng nhập, bạn thử lại nhé');
      const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const info = await infoRes.json().catch(() => ({}));
      if (!infoRes.ok || !info.sub) throw new OAuthError('Không đọc được thông tin tài khoản Google');
      if (!info.email || info.email_verified !== true) throw new OAuthError('Email Google của bạn chưa được xác minh');
      return { id: String(info.sub), email: String(info.email), name: info.name || '', avatar: info.picture || null };
    },
  },
  facebook: {
    label: 'Facebook',
    configured: () => Boolean(process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET),
    authorizeUrl({ redirectUri, state }) {
      const params = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'email,public_profile',
        state,
      });
      return `https://www.facebook.com/dialog/oauth?${params}`;
    },
    async profile({ code, redirectUri }) {
      const tokenParams = new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      });
      const tokenRes = await fetch(`https://graph.facebook.com/oauth/access_token?${tokenParams}`);
      const tokens = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokens.access_token) throw new OAuthError('Facebook không xác nhận được đăng nhập, bạn thử lại nhé');
      const meParams = new URLSearchParams({ fields: 'id,name,email,picture.type(large)', access_token: tokens.access_token });
      const meRes = await fetch(`https://graph.facebook.com/me?${meParams}`);
      const me = await meRes.json().catch(() => ({}));
      if (!meRes.ok || !me.id) throw new OAuthError('Không đọc được thông tin tài khoản Facebook');
      if (!me.email) throw new OAuthError('Tài khoản Facebook chưa chia sẻ email. Bạn cấp quyền email hoặc đăng ký bằng email nhé');
      const picture = me.picture?.data?.is_silhouette ? null : me.picture?.data?.url || null;
      return { id: String(me.id), email: String(me.email), name: me.name || '', avatar: picture };
    },
  },
};

function clientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:4200').replace(/\/+$/, '');
}

function redirectUri(provider) {
  const base = process.env.OAUTH_REDIRECT_BASE
    || (process.env.NODE_ENV === 'production' ? `${clientUrl()}/api` : `http://localhost:${process.env.PORT || 3002}/api`);
  return `${base.replace(/\/+$/, '')}/auth/oauth/${provider}/callback`;
}

module.exports = { PROVIDERS, OAuthError, clientUrl, redirectUri };
