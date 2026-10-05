import { nextSendTime } from './quiet-hours';
import type { Rendered } from './templates';

export interface NotifyInput {
  userIds: string[];
  tripId: string | null;
  template: string;
  rendered: Rendered;
  urgent: boolean;
  relatedEntityId?: string | null;
}

export interface Recipient {
  id: string;
  email: string | null;
  phone: string | null;
  sms_opt_in: boolean;
  /** True only when an unrevoked SMS consent row exists. sms_opt_in is user-writable, so it cannot authorize texting alone. */
  sms_consent: boolean;
  timezone: string;
}

export interface PlannedNotification {
  trip_id: string | null;
  user_id: string;
  channel: 'email' | 'sms';
  template: string;
  subject: string | null;
  body: string;
  urgent: boolean;
  send_after: string;
  related_entity_id: string | null;
}

/** Email always (when we have an address); SMS only with a phone, the opt-in flag, and an active consent record, while SMS is switched on. */
export function planDeliveries(recipients: Recipient[], input: NotifyInput, now: Date, smsOn: boolean): PlannedNotification[] {
  const rows: PlannedNotification[] = [];
  for (const recipient of recipients) {
    if (!input.userIds.includes(recipient.id)) continue;
    const sendAfter = (input.urgent ? now : nextSendTime(now, recipient.timezone)).toISOString();
    const base = { trip_id: input.tripId, user_id: recipient.id, template: input.template, urgent: input.urgent, send_after: sendAfter, related_entity_id: input.relatedEntityId ?? null };
    if (recipient.email) rows.push({ ...base, channel: 'email', subject: input.rendered.subject, body: input.rendered.text });
    if (smsOn && recipient.phone && recipient.sms_opt_in && recipient.sms_consent) rows.push({ ...base, channel: 'sms', subject: null, body: input.rendered.sms });
  }
  return rows;
}
