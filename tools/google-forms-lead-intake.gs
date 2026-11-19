/**
 * Bind this Apps Script to the Google Form (not its response spreadsheet).
 * Set Script Properties: LEAD_WEBHOOK_URL, LEAD_WEBHOOK_SECRET and LEAD_FIELD_MAP.
 * Example LEAD_FIELD_MAP: {"name":"Full name","phone":"Phone","email":"Email","destination":"Destination","notes":"Travel requirements"}
 * Phone answers must include country code. Run installLeadIntake once and authorize it.
 * Failed deliveries retry every minute from the last successful response checkpoint.
 */
function installLeadIntake() {
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty('LEAD_WEBHOOK_URL') || !properties.getProperty('LEAD_WEBHOOK_SECRET')) throw new Error('Configure the webhook URL and secret in Script Properties first.');
  if (!properties.getProperty('LEAD_CURSOR')) properties.setProperty('LEAD_CURSOR', JSON.stringify({ timestamp: Date.now(), id: '' }));
  const existing = ScriptApp.getProjectTriggers().map(t => t.getHandlerFunction());
  if (!existing.includes('forwardLeadOnSubmit')) ScriptApp.newTrigger('forwardLeadOnSubmit').forForm(FormApp.getActiveForm()).onFormSubmit().create();
  if (!existing.includes('retryLeadResponses')) ScriptApp.newTrigger('retryLeadResponses').timeBased().everyMinutes(1).create();
}

function forwardLeadOnSubmit(event) {
  if (!event || !event.response) throw new Error('This function requires a Google Form submission event.');
  deliverLeadResponse(event.response);
}

function deliverLeadResponse(response) {
  const properties = PropertiesService.getScriptProperties();
  const form = FormApp.getActiveForm();
  const map = JSON.parse(properties.getProperty('LEAD_FIELD_MAP') || '{}');
  const answers = {};
  response.getItemResponses().forEach(item => { answers[item.getItem().getTitle()] = String(item.getResponse()); });
  const payload = { submissionId: response.getId(), formId: form.getId(), formName: form.getTitle(), name: answers[map.name] || 'New enquiry', answers: answers };
  ['phone', 'email', 'destination', 'notes'].forEach(key => { if (map[key] && answers[map[key]]) payload[key] = answers[map[key]]; });
  if (!payload.email && response.getRespondentEmail()) payload.email = response.getRespondentEmail();
  const result = UrlFetchApp.fetch(properties.getProperty('LEAD_WEBHOOK_URL'), {
    method: 'post', contentType: 'application/json', headers: { 'X-Lead-Secret': properties.getProperty('LEAD_WEBHOOK_SECRET') },
    payload: JSON.stringify(payload), muteHttpExceptions: true,
  });
  if (result.getResponseCode() !== 200) throw new Error('Lead delivery failed (HTTP ' + result.getResponseCode() + '). The scheduled trigger will retry.');
}

function retryLeadResponses() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const properties = PropertiesService.getScriptProperties();
    const saved = properties.getProperty('LEAD_CURSOR');
    if (!saved) throw new Error('Run installLeadIntake before retrying.');
    const cursor = JSON.parse(saved);
    const responses = FormApp.getActiveForm().getResponses(new Date(cursor.timestamp))
      .filter(r => r.getTimestamp().getTime() > cursor.timestamp || (r.getTimestamp().getTime() === cursor.timestamp && r.getId() > cursor.id))
      .sort((a, b) => a.getTimestamp().getTime() - b.getTimestamp().getTime() || (a.getId() < b.getId() ? -1 : a.getId() > b.getId() ? 1 : 0)).slice(0, 50);
    for (const response of responses) {
      deliverLeadResponse(response);
      properties.setProperty('LEAD_CURSOR', JSON.stringify({ timestamp: response.getTimestamp().getTime(), id: response.getId() }));
    }
  } finally { lock.releaseLock(); }
}
