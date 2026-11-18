# Contact details

The Contacts directory, Add Contact form and Edit Contact form expose:

| Label | API field | Format |
| --- | --- | --- |
| Full name | `name` | Required text |
| Preferred month of travel | `preferredTravelMonth` | Optional month/year, stored as `YYYY-MM` |
| Tour type | `tourType` | Optional text; suggestions allow custom values |
| Number of children | `numberOfChildren` | Optional whole number from 0 to 1000; blank means unknown |
| Special requirements | `specialRequirements` | Optional multiline text |
| Phone number | `phone` | Country code required when supplied |
| Email address | `email` | Valid email when supplied |
| City | `city` | Optional text |

At least one of phone or email is required. Existing company and notes fields remain available under Other contact details. Existing contacts retain their data; newly added preferences start blank. Preferences can be cleared explicitly. Changing contact preferences does not rewrite existing trip enquiries or itineraries.

Use **Contacts → Add Contact** to create a profile, or **Edit** on a contact row to change its details. Save, refresh and reopen Edit to verify persistence. Special requirements expand in the directory. Editing uses the current contact version and rejects stale saves. Owners/admins can edit contacts in their agency; salespeople/operators can edit contacts linked to their assigned leads.

The sample CSV includes all fields. Preferred month values use `YYYY-MM` (for example `2027-04`); Number of children accepts `0`, and an empty cell remains unknown. Older CSV files remain supported. Website/generic intake payloads may also supply the new canonical field names; preferences are saved on newly created contacts. Repeat enquiries retain their submitted preferences on the enquiry without silently overwriting an existing contact profile. Other provider-specific custom answers remain available as original form answers and can be entered into the profile by staff.

Apply `npx prisma migrate deploy` before running the updated app. The migration adds five nullable columns and a child-count constraint; no existing contact is deleted. Run `npm run test:lead-intake` for the database-backed contact checks and existing release regressions, using a disposable local PostgreSQL schema.
