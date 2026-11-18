# REQ-13, REQ-14 and REQ-15

## Itinerary budget comparison

Open a generated itinerary, then choose **Compare itineraries**. A comparison initially contains the current saved itinerary. Enter one to three whole-trip budget amounts separated by commas (for example `50000, 75000, 100000`), choose the currency, and add staff instructions. Choose **Generate alternatives with AI**. The configured agency AI provider receives the original programme, destination, duration, agency rules, and the linked requirement-call transcript when available. No separate lead is created for each budget.

The table places budget target first, then option, day/date, location, programme, hotel, meals and transfers. The same day from each option appears together. A missing hotel, meal or transfer is displayed as not specified rather than invented by the table renderer. Locations use explicit daily Location/City/Destination lines when present, otherwise the saved overall destination. Budget figures are planning targets for the whole trip, not supplier-verified selling prices. Review supplier quotations separately before sending commercial documents.

Saved alternatives can be edited manually or revised with AI. **Use as main itinerary** replaces the main programme and budget target and saves the previous programme as an alternative. Options for changed destinations, dates or durations must be regenerated before selecting them. Concurrent updates are rejected, preserving saved work. A failed batch creates no partial set of alternatives and never replaces the current itinerary. A completed batch remains saved if the browser disconnects; reopen the comparison before retrying.

In the existing AI revision box, explicit table/comparison requests, or requests for different budgets, open the comparison tool and carry the request into its instructions. Other revision requests continue through the existing AI revision workflow. Formatting a table uses saved data and does not require another AI call. Tabs retain comparison inputs while the lead remains open; exports use saved alternatives.

## PDF and Word downloads

PDF remains the default in the lead header. Select **Word (.docx)** to download the saved main programme as an editable Word document. Comparison view offers both a landscape comparison PDF and a genuine editable Word table. The comparison Word file also includes the complete saved source programmes and their inclusions/exclusions and notes. The comparison PDF presents the daily comparison; the existing itinerary proposal PDF remains available for the full main proposal and existing agency branding.

Editing a downloaded Word file does not automatically update the application. Save edits in the application when they should be included in subsequent downloads and emails. Unsaved main-itinerary edits block exports until saved or cancelled. Existing lead ownership checks also protect option operations and document downloads.

## Browser calling setup

1. Apply the migration using `npx prisma migrate deploy` and build/deploy the application. Reload staff browser sessions after deployment.
2. Configure Plivo under **Settings → Platform & BYOK**, including its application and public HTTPS callback base. The existing credential setup stores the Plivo application ID. Each staff member now gets a separate browser SIP endpoint; no shared endpoint is returned to all users. Endpoint passwords are encrypted on membership records and returned only to their authenticated owner, with no-store caching. Interrupted provisioning can recover an endpoint with the same agency/user alias.
3. Under **Settings → Lead Intake → Sales rotation**, enable **Receives leads** and **Available** for participants. Calls use a separate round-robin order while sharing these eligibility settings. Keep the application open and wait for **Browser phone ready**. Presence refreshes every 20 seconds and expires after 60 seconds. Busy, unavailable, disabled or offline staff are skipped. Existing explicit number forwarding remains respected.
4. Choose **Enable call alerts** and allow notifications. Permit microphone access when answering. The incoming-call screen shows Answer and Decline. Connection is confirmed by SDK events, with microphone/connection errors shown inline. A call is not marked connected merely because the Answer button was clicked.
5. The assigned browser rings. In a supported desktop browser, a permitted notification and tab-title change draw attention when the app tab is in the background. Clicking the notification focuses the app. The application must remain open; closed-browser push notifications are not included.
6. The provider's signed Dial callback records whether the salesperson answered. Unanswered, rejected or unavailable-agent calls remain missed, including when the caller leaves a voicemail. Rejected calls also retain a declined outcome. The Calls screen includes a **Missed** filter. Existing legacy records without agent tracking are not reclassified retroactively.

When no eligible agent can receive the call, the existing voicemail flow remains available. End or decline the current call before switching agencies. Switching agencies takes the previous browser phone offline and prevents it reconnecting with the old agency's endpoint.

### Assigned contacts and returning callers

Calls from a known contact first ring the salesperson on that contact's most recently assigned enquiry, including confirmed bookings. Matching uses the complete phone number and country code within the current agency. Store contact numbers with their country code. If several enquiries have different assignees, the latest assignment determines the responsible person. A newer unassigned enquiry does not remove an existing assignment.

The responsible person needs an active account, an available browser phone and **Available** enabled. They can still receive calls from their existing contacts with **Receives leads** disabled; that setting controls participation in rotation for new leads and backup calls. If the responsible person is offline, busy or unavailable, routing tries an available round-robin backup immediately. Otherwise their browser rings for up to 25 seconds; a decline or unanswered attempt then tries available backups in round-robin order. Each person is tried at most once per call. Voicemail remains the final option if nobody can answer.

A backup answering does not change the enquiry assignment. Every subsequent call starts with the responsible person again. Call completion releases the browser reservation using the Dial completion, browser-leg hangup, parent hangup or completed status callback. Delayed callbacks from an older call cannot clear a new call's reservation. Calls without a matching assignment retain the existing round-robin and voicemail behavior. Explicit phone-number forwarding remains respected.

## Acceptance checks

- Generate two alternatives for the same destination using different budgets; check each requested column and original call requirements.
- Ask the revision box to show a comparison table; confirm it opens comparison view and does not replace the original itinerary with a markdown table.
- Revise and manually edit an alternative, then select it as main; confirm the previous main programme is preserved.
- Download PDF and Word for the main itinerary and comparison. Open Word in Word or LibreOffice, edit a paragraph and table cell, and save. Check long programmes span multiple pages.
- Sign in as two enabled, available salespeople in separate browser profiles. Use a caller without an assigned enquiry to check round-robin rotation and verify two-way audio.
- Link a caller's contact to an enquiry assigned to salesperson A. Call from that contact's saved number and confirm only A rings first. Answer, end the conversation, and immediately call again: A should ring again.
- Leave A's next call unanswered or decline it. Confirm salesperson B rings next and can answer. End that call, call again, and confirm A rings first and the enquiry assignment still belongs to A.
- Make A busy, offline or unavailable and confirm B can receive the call. Make both unavailable and confirm voicemail and missed-call history. Restore availability afterward.
- Leave another call unanswered, reject another, and test with both users unavailable. Confirm missed history persists even after voicemail and hangup callbacks.
- Put the receiving tab in the background and verify its desktop notification. Deny microphone permission and verify the error remains visible without falsely marking the call connected.
- Verify other salespeople and other agencies cannot read, edit, apply or export this lead's alternatives.

`npm run test:lead-intake` runs release and priority checks against a disposable local PostgreSQL schema, including concurrent reservations, signed callback ordering, option persistence, endpoint separation, DOCX structure and comparison PDF pagination. AI and endpoint-provider responses are mocked in those tests; real AI output and live Plivo audio need an environment-specific smoke test.
