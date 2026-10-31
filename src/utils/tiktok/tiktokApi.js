import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config({ path: "./src/.env" });

// Thin client for the official TikTok API (Login Kit + Display API).
// Docs: https://developers.tiktok.com/doc/login-kit-web
//       https://developers.tiktok.com/doc/oauth-user-access-token-management
//       https://developers.tiktok.com/doc/tiktok-api-v2-video-list

const AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_INFO_URL = "https://open.tiktokapis.com/v2/user/info/";
const VIDEO_LIST_URL = "https://open.tiktokapis.com/v2/video/list/";

const SCOPES = "user.info.basic,video.list";
const VIDEO_FIELDS = "id,title,video_description,create_time,cover_image_url,share_url";

function getConfig() {
    return {
        clientKey: process.env.TIKTOK_CLIENT_KEY,
        clientSecret: process.env.TIKTOK_CLIENT_SECRET,
        redirectUri: process.env.TIKTOK_REDIRECT_URI,
    };
}

export function isTikTokConfigured() {
    const { clientKey, clientSecret, redirectUri } = getConfig();
    return Boolean(clientKey && clientSecret && redirectUri);
}

export function createOAuthState() {
    return crypto.randomBytes(16).toString("hex");
}

export function buildAuthorizeUrl(state) {
    const { clientKey, redirectUri } = getConfig();
    const params = new URLSearchParams({
        client_key: clientKey,
        scope: SCOPES,
        response_type: "code",
        redirect_uri: redirectUri,
        state,
    });
    return `${AUTHORIZE_URL}?${params}`;
}

// Normalised token set. Expiry times are stored as JS millisecond timestamps.
function toTokenSet(json) {
    if (!json.access_token) {
        const reason = json.error_description || json.error || json.message || "unknown error";
        const error = new Error(`TikTok token request failed: ${reason}`);
        error.tiktokError = json.error;
        throw error;
    }
    const now = Date.now();
    return {
        openId: json.open_id,
        accessToken: json.access_token,
        accessExpiresAt: now + json.expires_in * 1000,
        refreshToken: json.refresh_token,
        refreshExpiresAt: now + json.refresh_expires_in * 1000,
        scope: json.scope,
    };
}

async function requestToken(params) {
    const { clientKey, clientSecret } = getConfig();
    const response = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, ...params }),
    });
    return toTokenSet(await response.json());
}

export function exchangeCode(code) {
    return requestToken({
        code,
        grant_type: "authorization_code",
        redirect_uri: getConfig().redirectUri,
    });
}

// TikTok may return a different refresh token here; callers must store the new one.
export function refreshAccessToken(refreshToken) {
    return requestToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

// Display API responses wrap data as { data, error: { code: "ok" | ..., message } }.
async function apiRequest(url, accessToken, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${accessToken}`, ...options.headers },
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json.error && json.error.code !== "ok")) {
        const error = new Error(`TikTok API error (${response.status}): ${json.error?.code} ${json.error?.message || ""}`.trim());
        error.tiktokError = json.error?.code;
        error.status = response.status;
        throw error;
    }
    return json.data;
}

export async function fetchUserInfo(accessToken) {
    const data = await apiRequest(`${USER_INFO_URL}?fields=open_id,display_name,avatar_url`, accessToken);
    return data.user;
}

// Newest videos first (TikTok sorts by create_time descending).
export async function fetchRecentVideos(accessToken, maxCount = 10) {
    const data = await apiRequest(`${VIDEO_LIST_URL}?fields=${VIDEO_FIELDS}`, accessToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: maxCount }),
    });
    return data.videos || [];
}
