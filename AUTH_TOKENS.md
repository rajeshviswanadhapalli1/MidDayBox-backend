# Access Token + Refresh Token (Frontend Guide)

This backend uses **short-lived access tokens** and **long-lived refresh tokens**. Users stay logged in until they tap **Logout** (refresh token is revoked). When the access token expires, the app automatically refreshes it.

---

## Token overview

| Token | Lifetime (default) | Storage (recommended) | Used for |
|-------|-------------------|------------------------|----------|
| **accessToken** | 15 minutes | Memory / secure storage | `Authorization: Bearer <accessToken>` on every API call |
| **refreshToken** | 30 days | Secure storage (Keychain / EncryptedSharedPreferences) | Only `POST /refresh` and `POST /logout` |

**Backward compatibility:** Login responses also include `token` = same value as `accessToken`.

---

## Login responses (all apps)

### Parent / School / Delivery boy
**POST** `/api/auth/login`

```json
{
  "success": true,
  "message": "Login successful",
  "accessToken": "eyJhbG...",
  "refreshToken": "random_opaque_string",
  "token": "eyJhbG...",
  "expiresIn": 900,
  "refreshExpiresAt": "2026-05-30T10:00:00.000Z",
  "user": { "id": "...", "role": "parent", ... }
}
```

### Admin / Sub admin
**POST** `/api/admin/login`

Same token fields as above. Sub admin also gets `user.permissions`.

---

## Refresh access token

**POST** `/api/auth/refresh`  
**POST** `/api/admin/refresh` (admin panel – same handler)

**Body**
```json
{
  "refreshToken": "<stored_refresh_token>"
}
```

**Success (200)**
```json
{
  "success": true,
  "message": "Token refreshed",
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token",
  "token": "new_access_token",
  "expiresIn": 900,
  "refreshExpiresAt": "2026-05-30T10:00:00.000Z"
}
```

**Important:** Each refresh **rotates** the refresh token. Always replace the stored refresh token with the new one from the response.

**Errors**
| code | HTTP | Action |
|------|------|--------|
| `INVALID_REFRESH_TOKEN` | 401 | Clear storage, go to login |
| `REFRESH_TOKEN_EXPIRED` | 401 | Clear storage, go to login |

---

## Logout

**POST** `/api/auth/logout`  
**POST** `/api/admin/logout`

**Body**
```json
{
  "refreshToken": "<stored_refresh_token>"
}
```

Clears the session on the server for that device. Client must delete `accessToken` and `refreshToken` locally.

### Logout all devices (optional)
Requires valid **access** token:

- **POST** `/api/auth/logout-all`
- **POST** `/api/admin/logout-all`

---

## Protected API calls (automatic refresh — recommended)

Send **both** tokens on **every** API request:

```
Authorization: Bearer <accessToken>
X-Refresh-Token: <refreshToken>
```

When the access token is **expired**, the backend **automatically** uses the refresh token, continues the request, and returns **new tokens** in:

**Response headers**
- `X-Access-Token`
- `X-Refresh-Token`
- `X-Token-Refreshed: true`
- `X-Token-Expires-In`

**Response JSON** (when the route returns JSON)
```json
{
  "success": true,
  "tokenRefreshed": true,
  "accessToken": "new...",
  "refreshToken": "same_or_new...",
  "token": "new...",
  "expiresIn": 900,
  "...": "your normal API data"
}
```

**Frontend rule:** After every API response, if `tokenRefreshed === true` or header `X-Token-Refreshed` is present, save the new `accessToken` (and `refreshToken` if changed).

This way **all APIs keep working** after access token expiry without calling `/refresh` first.

---

## Protected API calls (manual refresh — optional)

Header only:
```
Authorization: Bearer <accessToken>
```

### When access token expires (no refresh header)

**HTTP 401** with:
```json
{
  "success": false,
  "code": "TOKEN_EXPIRED",
  "message": "Access token expired. Send X-Refresh-Token header or call POST /api/auth/refresh."
}
```

Call `POST /refresh`, then retry the request.

---

## Frontend implementation (React Native / Web)

### 1) After login – save tokens

```javascript
async function saveSession(data) {
  await SecureStore.setItemAsync('accessToken', data.accessToken);
  await SecureStore.setItemAsync('refreshToken', data.refreshToken);
  await SecureStore.setItemAsync('user', JSON.stringify(data.user));
}
```

### 2) API client with auto-refresh (axios example)

```javascript
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const api = axios.create({
  baseURL: 'https://api.middaybox.com/api',
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.request.use(async (config) => {
  const accessToken = await SecureStore.getItemAsync('accessToken');
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  if (refreshToken) {
    config.headers['X-Refresh-Token'] = refreshToken;
  }
  return config;
});

api.interceptors.response.use(async (response) => {
  const refreshed = response.headers['x-token-refreshed'] === 'true' || response.data?.tokenRefreshed;
  if (refreshed) {
    const accessToken =
      response.headers['x-access-token'] || response.data?.accessToken;
    const refreshToken =
      response.headers['x-refresh-token'] || response.data?.refreshToken;
    if (accessToken) await SecureStore.setItemAsync('accessToken', accessToken);
    if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
  }
  return response;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const code = error.response?.data?.code;

    if (code !== 'TOKEN_EXPIRED' || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await SecureStore.getItemAsync('refreshToken');
      const { data } = await axios.post(
        'https://api.middaybox.com/api/auth/refresh',
        { refreshToken }
      );

      await SecureStore.setItemAsync('accessToken', data.accessToken);
      await SecureStore.setItemAsync('refreshToken', data.refreshToken);

      processQueue(null, data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError, null);
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      // navigate to Login screen
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
```

For **admin panel**, use `/api/admin/refresh` instead of `/api/auth/refresh`.

### 3) App launch – restore session

```javascript
async function tryRestoreSession() {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  if (!refreshToken) return false;

  try {
    const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
    await saveSession(data);
    return true;
  } catch {
    await clearSession();
    return false;
  }
}
```

If `tryRestoreSession()` returns `true`, open the home screen (user stays logged in without password).

### 4) Logout button

```javascript
async function logout() {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  try {
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken });
    }
  } finally {
    await clearSession();
    // navigate to Login
  }
}
```

---

## Environment variables (backend)

```env
JWT_ACCESS_SECRET=your_access_secret
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_DAYS=30
FIREBASE_SERVICE_ACCOUNT_PATH=./config/ServiceAccountKey.json
```

Optional: `JWT_SECRET` is still used as fallback for `JWT_ACCESS_SECRET`.

---

## Summary flow

```
Login → save accessToken + refreshToken
     → API calls use accessToken
     → 401 TOKEN_EXPIRED → POST /refresh → retry request
     → App reopen → POST /refresh with stored refreshToken
Logout → POST /logout + clear local tokens
```

User remains logged in until **logout** or **refresh token expires** (default 30 days without opening the app).
