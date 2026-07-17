---
name: backend-api-design
description: REST API contract standards. Reference for backend agent when designing endpoints.
---

# Backend API Design Standards (v6.5.0)

## Purpose

Define the contract standards for REST APIs built by the `backend`
agent. Ensures consistency across endpoints, predictable for frontend
consumers, and compatible with OpenAPI tooling.

## Resource naming

### Use nouns, not verbs

```
✅ GET    /users              (list users)
✅ POST   /users              (create user)
✅ GET    /users/{id}         (get one user)
✅ PATCH  /users/{id}         (partial update)
✅ PUT    /users/{id}         (full update)
✅ DELETE /users/{id}         (delete)

❌ GET    /getUsers
❌ POST   /createUser
❌ POST   /user/delete
```

### Plural resources

```
✅ /users, /orders, /payments
❌ /user, /order, /payment
```

### Nesting for relationships (max 2 levels)

```
✅ /users/{id}/orders
✅ /users/{id}/orders/{orderId}

❌ /users/{id}/orders/{orderId}/items/{itemId}/variations
   (use a flat endpoint with filters instead: /items?variationId=...)
```

### Actions as sub-resources (only when REST verbs don't fit)

```
POST   /users/{id}/sessions       (login)
DELETE /users/{id}/sessions       (logout)
POST   /users/{id}/password-reset
POST   /payments/{id}/refunds
```

## HTTP methods

| Method | Idempotent | Safe | Use for |
|---|---|---|---|
| GET    | ✅ | ✅ | Read |
| POST   | ❌ | ❌ | Create / non-idempotent action |
| PUT    | ✅ | ❌ | Full replace |
| PATCH  | ❌* | ❌ | Partial update (* can be idempotent with care) |
| DELETE | ✅ | ❌ | Delete |

## Status codes

### Success (2xx)

- `200 OK` — request succeeded, response body present
- `201 Created` — resource created, response body + `Location` header
- `204 No Content` — request succeeded, no response body (e.g., DELETE)

### Client error (4xx)

- `400 Bad Request` — malformed request (invalid JSON, missing required field)
- `401 Unauthorized` — missing or invalid auth
- `403 Forbidden` — authenticated but not allowed
- `404 Not Found` — resource doesn't exist
- `409 Conflict` — state conflict (e.g., duplicate email)
- `422 Unprocessable Entity` — validation failed (semantically wrong)
- `429 Too Many Requests` — rate limited

### Server error (5xx)

- `500 Internal Server Error` — unhandled error (shouldn't leak details)
- `502 Bad Gateway` — upstream service failed
- `503 Service Unavailable` — temporary unavailability
- `504 Gateway Timeout` — upstream timeout

## Request/response shape

### Request body (POST/PUT/PATCH)

```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "age": 30
}
```

### Response body (single resource)

```json
{
  "data": {
    "id": "usr_abc123",
    "name": "João Silva",
    "email": "joao@example.com",
    "age": 30,
    "createdAt": "2026-07-17T14:30:00Z"
  }
}
```

### Response body (collection)

```json
{
  "data": [
    { "id": "usr_abc", "name": "João" },
    { "id": "usr_def", "name": "Maria" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

### Error response (consistent shape)

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Email is invalid",
    "details": [
      { "field": "email", "message": "Must be a valid email" }
    ],
    "traceId": "trc_abc123"
  }
}
```

## Pagination

Always paginate collections. Use cursor-based for large datasets,
offset-based for small/medium.

### Offset (page/pageSize)

```
GET /users?page=2&pageSize=20
```

```json
{ "data": [...], "pagination": { "page": 2, "pageSize": 20, "total": 42 } }
```

### Cursor (for large / real-time data)

```
GET /events?after=evt_abc123&limit=50
```

```json
{
  "data": [...],
  "nextCursor": "evt_def456",
  "hasMore": true
}
```

## Filtering, sorting, field selection

### Filtering

```
GET /users?status=active&role=admin
GET /orders?createdAt[gte]=2026-01-01&createdAt[lte]=2026-12-31
```

### Sorting

```
GET /users?sort=createdAt:desc,name:asc
```

### Field selection (sparse fieldsets)

```
GET /users?fields=id,name,email
```

## Versioning

### URL versioning (preferred for major changes)

```
/v1/users
/v2/users
```

### Header versioning (for minor changes)

```
Accept: application/vnd.myapi.v2+json
```

## Rate limiting

Every public endpoint must have rate limits. Response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1626543600
```

When exceeded:

```
HTTP 429
Retry-After: 30
```

## Authentication

- Bearer token in `Authorization` header (JWT or opaque)
- Refresh token via secure cookie (httpOnly, secure, sameSite)
- OAuth2 flows for third-party integrations
- API keys for server-to-server (in `X-API-Key` header)

## OpenAPI

Every API MUST have an OpenAPI 3.1 spec. The spec is the source of
truth — code generation can derive types from it.

```
openapi/
  └── v1.yaml
```

The `tester` agent reads the OpenAPI spec to generate E2E test chains.

## Anti-patterns

- ❌ Verbs in URL (`/getUsers`, `/createOrder`)
- ❌ Inconsistent response shape across endpoints
- ❌ Leak of internal errors in 5xx responses
- ❌ Returning 200 for errors with `success: false` in body
- ❌ Unpaginated collections
- ❌ Date strings without timezone
- ❌ Numeric IDs (use UUIDs or ULIDs)
- ❌ Missing rate limits on public endpoints
- ❌ Inconsistent error format

## Related skills

- `backend-tdd` — TDD protocol for the implementation
- `security-audit` — security checklist
- `lgpd-compliance` — if endpoint touches PII
- `qa-e2e` — how the tester uses the OpenAPI spec
