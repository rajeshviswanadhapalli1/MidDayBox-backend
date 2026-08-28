# Festival / Scheduled Wishes — Admin & Mobile App

Show a **popup** (image or video) when the user opens the app during a scheduled date range.

| User action | Behaviour |
|-------------|-----------|
| **Close (X)** | Hide **only for this app session**. Shows again on next app open. **No API call** — handled on device. |
| **Hide / Don't show again** | Hide **permanently** for that user. Calls `POST /api/festival-wishes/:id/hide`. |

Files are stored in **AWS S3**; schedule and metadata in **MongoDB**.

---

## Audience

| `audience` | Who sees the wish |
|------------|-------------------|
| `all` | School + Parent + Delivery boy |
| `school` | School accounts only |
| `parent` | Parent accounts only |
| `deliveryboy` | Delivery boy accounts only |

A wish is shown only when:
- `isActive === true`
- Current time is between `startDate` and `endDate`
- User has **not** permanently hidden it

---

# Admin APIs

Base: `https://api.middaybox.com/api/admin`  
Auth: `Authorization: Bearer <admin_token>`

## 1) Create festival wish

**POST** `/api/admin/festival-wishes`  
**Content-Type:** `multipart/form-data`

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Heading (e.g. "Happy Diwali") |
| `message` | string | No | Short text under title |
| `mediaType` | string | Yes | `image` or `video` |
| `audience` | string | No | `all` (default), `school`, `parent`, `deliveryboy` |
| `startDate` | string | Yes | ISO date — wish starts (e.g. `2026-10-20T00:00:00.000Z`) |
| `endDate` | string | Yes | ISO date — wish ends |
| `sortOrder` | number | No | Lower = higher priority (default `0`) |
| `image` | file | If `mediaType=image` | Festival image (JPEG/PNG/WebP) |
| `video` | file | If `mediaType=video` | MP4/MOV/WebM (max 100MB) |
| `thumbnail` | file | No | Poster for video |

### Example — image wish (curl)

```bash
curl -X POST "https://api.middaybox.com/api/admin/festival-wishes" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "title=Happy Diwali" \
  -F "message=Wishing you joy and prosperity" \
  -F "mediaType=image" \
  -F "audience=all" \
  -F "startDate=2026-10-20T00:00:00.000Z" \
  -F "endDate=2026-10-25T23:59:59.999Z" \
  -F "image=@/path/diwali.jpg"
```

### Example — video wish

```bash
curl -X POST "https://api.middaybox.com/api/admin/festival-wishes" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "title=New Year Greetings" \
  -F "mediaType=video" \
  -F "audience=parent" \
  -F "startDate=2026-12-31T00:00:00.000Z" \
  -F "endDate=2027-01-02T23:59:59.999Z" \
  -F "video=@/path/greeting.mp4" \
  -F "thumbnail=@/path/poster.jpg"
```

### Response (201)

```json
{
  "success": true,
  "message": "Festival wish created successfully",
  "wish": {
    "id": "65f2...",
    "title": "Happy Diwali",
    "message": "Wishing you joy and prosperity",
    "mediaType": "image",
    "mediaUrl": "https://bucket.s3.../festival-wishes/images/...",
    "thumbnailUrl": null,
    "audience": "all",
    "startDate": "2026-10-20T00:00:00.000Z",
    "endDate": "2026-10-25T23:59:59.999Z",
    "isActive": true,
    "sortOrder": 0
  }
}
```

---

## 2) List wishes (admin)

**GET** `/api/admin/festival-wishes?audience=all&isActive=true&page=1&limit=20`

---

## 3) Get one wish

**GET** `/api/admin/festival-wishes/:id`

---

## 4) Update wish

**PATCH** `/api/admin/festival-wishes/:id`  
Same `multipart` fields as create (all optional). Set `isActive=false` to stop showing without deleting.

---

## 5) Delete wish

**DELETE** `/api/admin/festival-wishes/:id`  
Deletes S3 files, dismissals, and DB record.

---

# Mobile app APIs

Base: `https://api.middaybox.com/api/festival-wishes`  
Auth: `Authorization: Bearer <access_token>` (+ `X-Refresh-Token` as usual)  
Roles: `school`, `parent`, `deliveryboy`

## 1) Get active wish (call on app open)

**GET** `/api/festival-wishes/active`

### Response — wish available

```json
{
  "success": true,
  "wish": {
    "id": "65f2...",
    "title": "Happy Diwali",
    "message": "Wishing you joy",
    "mediaType": "image",
    "mediaUrl": "https://...jpg",
    "thumbnailUrl": null,
    "audience": "all",
    "startDate": "...",
    "endDate": "..."
  }
}
```

### Response — nothing to show

```json
{
  "success": true,
  "wish": null
}
```

---

## 2) Permanent hide

**POST** `/api/festival-wishes/:id/hide`

Call when user taps **Hide** / **Don't show again**.

```json
{
  "success": true,
  "message": "Festival wish hidden permanently for this account"
}
```

**Do not call this API for Close (X)** — close is session-only on the client.

---

# Admin panel implementation

## Create / edit form

1. Title, message  
2. Media type: Image | Video  
3. Upload image **or** video (+ optional thumbnail for video)  
4. Audience dropdown  
5. Start date & end date (date + time pickers)  
6. Active toggle (on edit)

### JavaScript upload

```javascript
async function createFestivalWish({ title, message, mediaType, audience, startDate, endDate, imageFile, videoFile, thumbFile }) {
  const form = new FormData();
  form.append('title', title);
  form.append('message', message);
  form.append('mediaType', mediaType);
  form.append('audience', audience);
  form.append('startDate', startDate);
  form.append('endDate', endDate);
  if (mediaType === 'image' && imageFile) form.append('image', imageFile);
  if (mediaType === 'video' && videoFile) form.append('video', videoFile);
  if (thumbFile) form.append('thumbnail', thumbFile);

  const res = await fetch(`${API}/admin/festival-wishes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: form
  });
  return res.json();
}
```

## List page

- Table: thumbnail, title, audience, start–end dates, active  
- Actions: Edit, Delete, Deactivate (`PATCH` with `isActive: false`)

---

# Mobile app implementation

## Flow on app launch (after login)

```
App opens → User logged in?
  → GET /api/festival-wishes/active
  → wish != null AND not closedThisSession?
      → Show full-screen modal
  → else skip
```

## Close vs Hide

| Button | App behaviour | API |
|--------|---------------|-----|
| **Close (X)** | Set `closedWishId = wish.id` in **memory only** (or session state). Dismiss modal. | None |
| **Hide** | Dismiss modal + never show again | `POST /api/festival-wishes/{id}/hide` |

On next cold start, **Close** resets (memory cleared) → API may return same wish → show again.  
**Hide** → API returns `wish: null` for that user forever (for that wish id).

## React Native example

```javascript
import { useEffect, useState } from 'react';
import { Modal, View, Image, Text, Pressable } from 'react-native';
import { Video } from 'expo-av';
import api from './api';

// Session-only: cleared when app process restarts
let closedWishIdThisSession = null;

export function FestivalWishModal() {
  const [wish, setWish] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    loadWish();
  }, []);

  async function loadWish() {
    const { data } = await api.get('/festival-wishes/active');
    if (!data.wish) return;
    if (closedWishIdThisSession === data.wish.id) return;
    setWish(data.wish);
    setVisible(true);
  }

  function onClose() {
    closedWishIdThisSession = wish.id;
    setVisible(false);
  }

  async function onHideForever() {
    await api.post(`/festival-wishes/${wish.id}/hide`);
    setVisible(false);
    setWish(null);
  }

  if (!wish) return null;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' }}>
          <Pressable onPress={onClose} style={{ alignSelf: 'flex-end', padding: 12 }}>
            <Text>✕ Close</Text>
          </Pressable>

          <Text style={{ fontSize: 20, fontWeight: 'bold', textAlign: 'center' }}>{wish.title}</Text>
          {wish.message ? <Text style={{ textAlign: 'center', margin: 8 }}>{wish.message}</Text> : null}

          {wish.mediaType === 'image' ? (
            <Image source={{ uri: wish.mediaUrl }} style={{ width: '100%', height: 280 }} resizeMode="contain" />
          ) : (
            <Video
              source={{ uri: wish.mediaUrl }}
              posterSource={wish.thumbnailUrl ? { uri: wish.thumbnailUrl } : undefined}
              usePoster
              style={{ width: '100%', height: 280 }}
              useNativeControls
              resizeMode="contain"
            />
          )}

          <Pressable onPress={onHideForever} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#666' }}>Don't show again</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
```

Mount `<FestivalWishModal />` in your root layout **after** authentication (home screen or app navigator).

## When to call `GET /active`

- After successful login  
- On app cold start if user already logged in (restore session)  
- Not needed on every screen navigation  

---

# S3 folders

| Type | Path |
|------|------|
| Image | `festival-wishes/images/` |
| Video | `festival-wishes/videos/` |
| Thumbnail | `festival-wishes/thumbnails/` |

Uses existing `AWS_S3_BUCKET` and credentials.

---

# API summary

| Who | Method | Endpoint |
|-----|--------|----------|
| Admin | POST | `/api/admin/festival-wishes` |
| Admin | GET | `/api/admin/festival-wishes` |
| Admin | GET | `/api/admin/festival-wishes/:id` |
| Admin | PATCH | `/api/admin/festival-wishes/:id` |
| Admin | DELETE | `/api/admin/festival-wishes/:id` |
| App | GET | `/api/festival-wishes/active` |
| App | POST | `/api/festival-wishes/:id/hide` |
