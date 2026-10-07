# Architecture SOP: Authentication, Multi-Tenancy & Security

## 1. Goal
Enforce enterprise-grade security across two distinct client types (Web Console and Mobile/External API), safeguard credentials with AES-256-GCM encryption, guarantee multi-tenant database isolation, implement fine-grained RBAC, and comply with call recording consent requirements.

---

## 2. Authentication: Two Audiences, Two Mechanisms

### 2.1 Web Console (Browser Session)
- **Engine:** Auth.js (NextAuth v5) with Credentials provider (Email + Argon2id/Bcrypt password).
- **Session:** Encrypted `httpOnly` cookies (`SameSite=Lax`, `Secure` in production).
- **MFA:** Time-Based One-Time Password (TOTP) support (RFC 6238). Secret is encrypted in `User.mfaSecretEnc`.

### 2.2 Mobile & External Clients (Token API)
- **Token Endpoint:** `POST /api/v1/auth/token`
  - Input: `{ email, password, totpCode? }`
  - Output:
    ```json
    {
      "accessToken": "eyJhbGciOi...",
      "expiresIn": 900,
      "refreshToken": "rt_8f1...",
      "tokenType": "Bearer"
    }
    ```
- **Access Tokens:** Short-lived JWTs (15 minutes, signed with `JWT_ACCESS_SECRET` via `jose`), containing `userId`, `organizationId`, and `role`.
- **Refresh Tokens:**
  - Opaque random strings hashed with SHA-256 into `Session.tokenHash` with `kind: 'api_refresh'`.
  - **Family Rotation & Reuse Detection:** When a refresh token is used, it is revoked and a new one issued in the same `familyId`. If an already-revoked refresh token is presented, the entire family is revoked immediately (mitigating token theft).
- **Invariant:** No endpoint under `/api/v1/**` may require a session cookie. The console authenticates via Bearer tokens when calling the API.

---

## 3. Credential Encryption at Rest (AES-256-GCM)

All external provider secrets (`authId`, `authToken`, `mfaSecret`) are encrypted before storage:
- **Cipher:** AES-256-GCM.
- **Key-Encryption-Key (KEK):** Sourced from environment variable `ENCRYPTION_KEK` (32-byte Base64).
- **IV:** Unique 12-byte initialization vector generated per encryption operation (`crypto.randomBytes(12)`).
- **Authentication Tag:** 16-byte GCM authentication tag stored in `encAuthTag`.
- **Masking:** Only `authIdLast4` is stored in plaintext for operator identification. Plaintext never appears in application logs or client bundles.

---

## 4. Role-Based Access Control (RBAC)

Hierarchy: `owner` > `admin` > `operator` > `viewer`.

| Capability | Viewer | Operator | Admin | Owner |
|---|:---:|:---:|:---:|:---:|
| View Calls, Messages, Transcripts | ✅ | ✅ | ✅ | ✅ |
| Play Call Recordings | ✅ | ✅ | ✅ | ✅ |
| Place Calls & Send Messages | ❌ | ✅ | ✅ | ✅ |
| Buy / Release Numbers | ❌ | ❌ | ✅ | ✅ |
| Manage Plivo Credentials | ❌ | ❌ | ✅ | ✅ |
| Manage Team Members & Roles | ❌ | ❌ | ❌ | ✅ |
| Delete Recordings / Account | ❌ | ❌ | ❌ | ✅ |

Enforced server-side in API route middleware:
```typescript
export function requireRole(allowedRoles: Role[]) {
  return async (req: NextRequest, ctx: RouteContext) => {
    const auth = await getAuthContext(req);
    if (!allowedRoles.includes(auth.role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  };
}
```

---

## 5. Multi-Tenant Database Isolation

1. Every database query must filter by `organizationId`.
2. Cross-tenant access attempts return HTTP 404 (or 403) and log an `AuditLog` security alert.
3. Prisma query extension automatically scopes reads and writes to the active tenant context.

---

## 6. Consent to Record & Regulatory Compliance

1. **Consent Notice:**
   - Operators can toggle automated playback of a recording announcement (e.g. *"This call is recorded for quality purposes"*) before bridging legs.
2. **India Telephony Regulations:**
   - 140-series: Promotional traffic only (9:00 AM – 9:00 PM).
   - 160-series: BFSI (Banking, Financial Services, Insurance) transactional traffic only.
   - Media anchoring compliance: Traffic must anchor in India data region where legally mandated.

---

## 7. Testing Strategy
- Unit test for AES-256-GCM encryption/decryption round-trip with tampered auth tag rejection.
- Unit test for refresh token family rotation and token reuse revocation.
- Integration test for tenant isolation: Org A user attempting to read Org B call ID returns 404.
- Integration test for RBAC: Viewer user attempting `POST /api/v1/calls` receives 403.
