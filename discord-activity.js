/* Neon Space Shooter — Discord Embedded Activity bridge.
 * Uses the official @discord/embedded-app-sdk through jsDelivr for this static build.
 * In a normal browser it safely falls back to offline mode.
 */
const CLIENT_ID = '1555904522943987762';
let discordSdk = null;
let auth = null;
let discordReady = false;
let sessionToken = null;

async function initDiscordActivity() {
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk/+esm');
    const DiscordSDK = mod.DiscordSDK;
    discordSdk = new DiscordSDK(CLIENT_ID);
    await discordSdk.ready();

    const { code } = await discordSdk.commands.authorize({
      client_id: CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'applications.commands']
    });

    const response = await fetch('/api/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ code })
    });
    if (!response.ok) throw new Error(`Token exchange failed (${response.status})`);
    const data = await response.json();
    sessionToken = data.session_token || null;
    auth = await discordSdk.commands.authenticate({ access_token: data.access_token });
    if (!auth) throw new Error('Discord authenticate returned no auth payload');
    discordReady = true;
    window.dispatchEvent(new CustomEvent('discord-activity-ready', {detail: auth}));
    console.log('[Discord Activity] authenticated', auth.user?.id);
  } catch (err) {
    console.warn('[Discord Activity] offline/browser mode:', err);
    window.dispatchEvent(new CustomEvent('discord-activity-offline', {detail: err}));
  }
}

window.discordActivityGameplayStart = () => {};
window.discordActivityGameplayStop = () => {};

window.discordActivitySubmitScore = async (score) => {
  if (!discordReady || !Number.isFinite(score)) return false;
  try {
    const r = await fetch('/api/score', {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(sessionToken ? {Authorization: `Bearer ${sessionToken}`} : {})},
      body: JSON.stringify({score: Math.max(0, Math.floor(score))})
    });
    if (!r.ok) throw new Error(`Score submit failed (${r.status})`);
    return await r.json();
  } catch (err) {
    console.warn('[Discord Activity] score submit failed:', err);
    return false;
  }
};

window.discordActivityGetLeaderboard = async (limit = 10) => {
  try {
    const r = await fetch(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
    return r.ok ? await r.json() : [];
  } catch { return []; }
};

initDiscordActivity();
