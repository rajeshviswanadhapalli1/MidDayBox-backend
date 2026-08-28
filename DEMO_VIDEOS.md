# Demo Videos API — Admin & Mobile App

Demo videos are uploaded by **admin**, stored in **AWS S3** (same bucket as images), and metadata is saved in **MongoDB**.  
The mobile app shows videos based on who is logged in:

| Login role      | Videos shown (`audience`) |
|-----------------|---------------------------|
| School          | `school`                  |
| Parent          | `parent`                  |
| Delivery boy    | `deliveryboy`             |

---

## Storage layout (S3)

| File      | S3 folder                    |
|-----------|------------------------------|
| Video     | `demo-videos/videos/`        |
| Thumbnail | `demo-videos/thumbnails/`    |

Uses existing env: `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

**Video:** MP4, MOV, WebM (max **100 MB** per file)  
**Thumbnail:** JPEG, PNG, WebP

---

# Admin APIs

Base URL: `https://api.middaybox.com/api/admin`  
Auth: `Authorization: Bearer <admin_access_token>`  
Optional: `X-Refresh-Token: <refresh_token>`

## 1) Upload demo video

**POST** `/api/admin/demo-videos`  
**Content-Type:** `multipart/form-data`

| Field             | Type   | Required | Description                          |
|-------------------|--------|----------|--------------------------------------|
| `video`           | file   | Yes      | Video file                           |
| `thumbnail`       | file   | Yes      | Thumbnail image                      |
| `title`           | string | Yes      | Display title                        |
| `audience`        | string | Yes      | `school` \| `parent` \| `deliveryboy` |
| `description`     | string | No       | Short description                    |
| `durationSeconds` | number | No       | Video length in seconds              |
| `sortOrder`       | number | No       | Lower = shown first (default `0`)    |

### Example (curl)

```bash
curl -X POST "https://api.middaybox.com/api/admin/demo-videos" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -F "video=@/path/demo.mp4" \
  -F "thumbnail=@/path/thumb.jpg" \
  -F "title=How to use MidDayBox" \
  -F "audience=parent" \
  -F "description=Step by step guide" \
  -F "sortOrder=1"
```

### Response (201)

```json
{
  "success": true,
  "message": "Demo video uploaded successfully",
  "video": {
    "id": "65f2...",
    "title": "How to use MidDayBox",
    "description": "Step by step guide",
    "audience": "parent",
    "videoUrl": "https://bucket.s3.region.amazonaws.com/demo-videos/videos/...",
    "thumbnailUrl": "https://bucket.s3.region.amazonaws.com/demo-videos/thumbnails/...",
    "durationSeconds": null,
    "sortOrder": 1,
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

## 2) List all demo videos (admin)

**GET** `/api/admin/demo-videos`

| Query       | Description                    |
|-------------|--------------------------------|
| `audience`  | Filter: `school`, `parent`, `deliveryboy` |
| `isActive`  | `true` / `false`               |
| `page`      | Default `1`                    |
| `limit`     | Default `20`                   |

### Response

```json
{
  "success": true,
  "videos": [ { "...": "same as above" } ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 1,
    "total": 3
  }
}
```

---

## 3) Get one video (admin)

**GET** `/api/admin/demo-videos/:id`

---

## 4) Update demo video

**PATCH** `/api/admin/demo-videos/:id`  
**Content-Type:** `multipart/form-data`

All fields optional. Send new `video` and/or `thumbnail` only when replacing files.

| Field             | Type   |
|-------------------|--------|
| `title`           | string |
| `description`     | string |
| `audience`        | string |
| `durationSeconds` | number |
| `sortOrder`       | number |
| `isActive`        | boolean / `"true"` `"false"` |
| `video`           | file   |
| `thumbnail`       | file   |

---

## 5) Delete demo video

**DELETE** `/api/admin/demo-videos/:id`

Removes DB record and deletes files from S3.

---

# Mobile app APIs

Base URL: `https://api.middaybox.com/api/demo-videos`  
Auth: `Authorization: Bearer <access_token>` (parent / school / delivery boy)

## Get videos for logged-in user

**GET** `/api/demo-videos`

No query params. Backend uses JWT `role` and returns only matching videos where `isActive: true`.

### School login → school videos

```json
{
  "success": true,
  "audience": "school",
  "videos": [
    {
      "id": "...",
      "title": "School onboarding",
      "description": "",
      "audience": "school",
      "videoUrl": "https://...mp4",
      "thumbnailUrl": "https://...jpg",
      "durationSeconds": 120,
      "sortOrder": 0,
      "isActive": true
    }
  ]
}
```

### Parent login → `audience: "parent"`  
### Delivery boy login → `audience: "deliveryboy"`

Call once after login (or on Demo / Help screen). Use `videoUrl` in a video player and `thumbnailUrl` as poster.

---

# Admin panel (frontend) guide

## Upload screen

1. Dropdown: **Audience** — School / Parent / Delivery boy  
2. Text: **Title**, **Description** (optional)  
3. File picker: **Video** (mp4 recommended)  
4. File picker: **Thumbnail** (jpg/png)  
5. Optional: **Sort order**, **Duration (seconds)**  
6. Submit → `POST /api/admin/demo-videos` as `FormData`

### React / web example

```javascript
const form = new FormData();
form.append('video', videoFile);
form.append('thumbnail', thumbnailFile);
form.append('title', 'Welcome');
form.append('audience', 'school');
form.append('description', 'How to register');
form.append('sortOrder', '0');

await fetch(`${API}/admin/demo-videos`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: form
});
```

## Manage list

- Tabs or filters: School | Parent | Delivery boy → `GET /api/admin/demo-videos?audience=school`  
- Table: thumbnail, title, active, actions (edit / delete)  
- Toggle active via PATCH `isActive: false`  
- Delete → `DELETE /api/admin/demo-videos/:id`

---

# Mobile app (React Native) guide

## When to load

After successful login, call:

```
GET /api/demo-videos
```

with the same token headers as other APIs (`Authorization` + `X-Refresh-Token`).

## UI

- **School app** → only school videos  
- **Parent app** → only parent videos  
- **Delivery boy app** → only delivery boy videos  

No need to pass `audience` from the client.

## Display

```javascript
const { data } = await api.get('/demo-videos');
data.videos.forEach((item) => {
  // item.thumbnailUrl — Image poster
  // item.videoUrl     — Video source (expo-av / react-native-video)
});
```

### Example (React Native + expo-av)

```jsx
import { Video } from 'expo-av';
import { Image } from 'react-native';

function DemoVideoCard({ item }) {
  return (
    <Video
      source={{ uri: item.videoUrl }}
      posterSource={{ uri: item.thumbnailUrl }}
      usePoster
      style={{ width: '100%', height: 200 }}
      resizeMode="contain"
      useNativeControls
    />
  );
}
```

## Empty state

If `videos.length === 0`, hide section or show “No demo videos available”.

---

# Summary

| Who        | Method | Endpoint                    |
|------------|--------|-----------------------------|
| Admin      | POST   | `/api/admin/demo-videos`    |
| Admin      | GET    | `/api/admin/demo-videos`    |
| Admin      | GET    | `/api/admin/demo-videos/:id`|
| Admin      | PATCH  | `/api/admin/demo-videos/:id`|
| Admin      | DELETE | `/api/admin/demo-videos/:id`|
| School     | GET    | `/api/demo-videos`          |
| Parent     | GET    | `/api/demo-videos`          |
| Delivery boy | GET  | `/api/demo-videos`          |

Ensure S3 bucket CORS allows your admin web origin and mobile app if videos are played in WebView.
