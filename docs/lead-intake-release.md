# Lead intake release

This release adds an enquiry inbox, provider intake, durable retries, exact form attribution, lead temperature/tags, contact matching, first-contact deadlines, and round-robin assignment.

## Deploy

1. Back up the database using the existing deployment process. Apply `npx prisma migrate deploy`, then run `npm run build` and deploy the Next.js application. The migration is additive except that contact phone numbers become nullable to support email-only enquiries. Existing records remain intact. Existing leads retain no assignee until an admin assigns them; source defaults to `unknown` because historical attribution cannot be inferred.
2. Set `ENCRYPTION_KEK` using the existing encryption configuration. Set a strong random `LEAD_INTAKE_WORKER_SECRET` in the hosting secret manager.
3. Schedule an HTTPS `POST /api/v1/lead-intake/process` every minute with `Authorization: Bearer <LEAD_INTAKE_WORKER_SECRET>`. This worker processes all organizations, up to 20 submissions per invocation. Scale invocation frequency or batch orchestration for larger volumes; avoid overlapping runs that exceed hosting limits. Requests from admins process only their own organization. A configured credential does not prove that a scheduler has been installed.
4. Configure real `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and the organization's notification email for email alerts. Failures always remain visible in Settings → Lead Intake and the owner's enquiry inbox. No simulated email is used for import alerts.
5. In Settings → Lead Intake, enable sales rotation participants and availability. Memberships are opted out initially so existing operators are not silently enrolled. The initial contact deadline is 30 elapsed minutes, configurable per agency. No business-hours calculation or follow-up notification delivery is included in this release.

## Access

Owners/admins see all leads and can manage integrations, credentials, availability, manual intake and reassignment. Operators and Sales see only assigned leads and contacts linked to their assigned leads. Ownership is enforced on nested lead endpoints as well as lists, regardless of URL encoding. Contact deletion is admin-only because one contact can be shared by multiple enquiries. Telephony and the existing other platform permissions remain unchanged. Sales can be selected when creating a staff member. Existing unassigned leads are available to owners/admins for review and reassignment.

## Connect providers

Each connection has a unique callback URL shown in Settings → Lead Intake. Secrets are entered or generated once, encrypted at rest, and excluded from all read responses. Copy the secret before saving. Editing credentials requires re-entering them. Pause stops new deliveries and worker processing; queued records remain intact.

### Google Ads

Create a Google Ads connection. Configure its callback URL and secret as the lead form's webhook URL and Google key. Map each form ID to the exact form name; the webhook provides IDs rather than form names. Missing mappings fail visibly and can be retried after updating the connection. Test deliveries are retained as `ignored` and never assigned to staff. Campaign, ad group, creative and click IDs are captured when supplied. See [Google's webhook schema](https://developers.google.com/google-ads/webhook/docs/implementation).

### Meta

Create a Meta connection with app secret, Page access token, Page ID, Graph API version enabled for the app, and webhook verification token. Configure the callback in the app's Page webhooks and subscribe to `leadgen`; install/subscribe the app on the Page. Grant the required lead retrieval permissions and arrange token renewal. The receiver verifies the raw-body SHA-256 signature and Page ID. The worker retrieves the lead and form name from Graph API. Configure form-name overrides if needed. A Meta app can have callback constraints: use the existing agency/app's subscription arrangement when provisioning each connection rather than overwriting another callback. See [Meta's setup and permissions](https://developers.facebook.com/docs/graph-api/webhooks/getting-started/webhooks-for-leadgen).

### Google Forms

Create a Google Forms connection. Copy [the Apps Script](../tools/google-forms-lead-intake.gs) into a script bound to the Form. Set `LEAD_WEBHOOK_URL`, `LEAD_WEBHOOK_SECRET`, and `LEAD_FIELD_MAP` in Script Properties; run `installLeadIntake` once and grant permissions. The field map links normalized names to exact question titles. The script installs submission and minute retry triggers. It starts at installation time; it does not import historical responses unless `LEAD_CURSOR` is deliberately set to an earlier timestamp. Form and response IDs provide attribution and deduplication. Immediate delivery and checkpoint retries can overlap safely. Monitor Apps Script trigger failure notifications, particularly while the application is unreachable. See [Google's Form event objects](https://developers.google.com/apps-script/guides/triggers/events#google_forms_events).

### Website and other forms

Send JSON from a trusted website server or form platform, never expose the webhook secret in browser code. Use `X-Lead-Secret`. Persist a stable `submissionId` before the first attempt and reuse it on retries. Retry non-200 responses. A 200 response means durable acceptance, with processing performed by the scheduled worker.

```json
{
  "submissionId": "website-response-123",
  "name": "Example Customer",
  "phone": "+919876543210",
  "email": "customer@example.com",
  "formId": "holiday-enquiry",
  "formName": "Holiday enquiry — homepage",
  "destination": "Japan",
  "notes": "Two travellers in April",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "spring-holidays"
}
```

Phone or email is required. Phone numbers require country codes. Optional fields include `temperature` (`hot`, `warm`, `cold`), `tags`, campaign/ad IDs and names, ad group ID and click ID. Source is set by the connection and cannot be spoofed by submitted JSON.

## Recovery and acceptance checks

Submissions deduplicate by connection and external submission ID. A different trip enquiry attaches to the same contact when its normalized phone or unambiguous email matches. Conflicting phone/email matches are flagged for review; existing contact details are never overwritten. Email-only contacts have a null phone. The same external ID on different connections is a separate submission; keep a provider form wired to a single connection.

Worker leases prevent concurrent workers from creating two leads for one submission. Expired leases recover after five minutes. Failures retry with increasing delay up to eight attempts; staff can queue a manual retry. The durable payload is retained; correct field errors at the sender and submit a new response ID, since replaying the same ID intentionally preserves the original submission. Worker and failure dashboards require operational monitoring. This release cannot detect a provider that silently stops sending webhooks.

Before enabling production traffic, test each real provider using a staging agency: valid delivery, exact form attribution, duplicate replay, repeat contact/new enquiry, email-only enquiry, malformed contact, paused connection, missing form mapping, transient provider failure and recovery, assignment with no available staff, concurrent imports, and cross-user/cross-agency access. Verify the scheduler while the console is closed and confirm a real failure alert reaches the notification mailbox.

Financial workflows, scheduled salesperson reminders, full departmental permissions, business-hours SLAs and monthly reports are later releases.
