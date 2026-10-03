export interface Rendered {
  subject: string;
  text: string;
  sms: string;
}

/** Replaces the typographic characters that would push an SMS from GSM-7 to UCS-2 (70 characters a segment). */
function gsm(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...');
}

function sms(body: string, url: string): string {
  const prefix = 'Elsewhere: ';
  const text = gsm(body);
  const room = 320 - prefix.length - url.length - 1;
  if (room < 4) return `${prefix}${url}`;
  // Count code points, not UTF-16 units, so an emoji is never cut in half.
  const chars = Array.from(text);
  return `${prefix}${chars.length > room ? `${chars.slice(0, room - 3).join('')}...` : text} ${url}`;
}

/** The planner's version of an incident notice when nobody is assigned to the booking. */
function nobodyOnBooking(bookingsUrl: string): string {
  return `Nobody is on this booking yet. Add who's flying: ${bookingsUrl}`;
}

/** The plan-ready notice, sent once the playbook is drafted (and released, on a hand-run trip). */
export function incidentNotice({ tripName, headline, url, bookingsUrl }: { tripName: string; headline: string; url: string; bookingsUrl?: string }): Rendered {
  return {
    subject: `${tripName}: your plan is ready`,
    text: `${headline}\n\nYour plan is ready. We drafted what you’re owed and what to send, with the rules cited:\n${url}${bookingsUrl ? `\n\n${nobodyOnBooking(bookingsUrl)}` : ''}\n\nElsewhere drafts; you decide and send. Not legal advice.`,
    sms: sms(`Your plan is ready. ${headline}${bookingsUrl ? ' Nobody is on this booking yet.' : ''}`, bookingsUrl ?? url),
  };
}

/**
 * The early heads-up, sent when an incident is detected and before anything is known to apply: the fact, and that a
 * plan follows. It claims no entitlement. With `bookingsUrl`, it goes to the planner because nobody is on the booking.
 */
export function incidentAlert({ tripName, headline, url, bookingsUrl }: { tripName: string; headline: string; url: string; bookingsUrl?: string }): Rendered {
  return {
    subject: `${tripName}: ${headline}`,
    text: `${headline} We're checking which passenger protections apply and will send your plan here: ${url}${bookingsUrl ? `\n\n${nobodyOnBooking(bookingsUrl)}` : ''}`,
    sms: sms(`${headline} We're checking which protections apply.${bookingsUrl ? ' Nobody is on this booking yet.' : ''}`, bookingsUrl ?? url),
  };
}

export function questionNotice({ tripName, prompt, url }: { tripName: string; prompt: string; url: string }): Rendered {
  return {
    subject: `${tripName}: one quick question`,
    text: `${prompt}\n\nYour answer decides which rules apply. Answer here:\n${url}`,
    sms: sms(`Quick question for ${tripName}: ${prompt}`, url),
  };
}

export function voteNotice({ tripName, title, url }: { tripName: string; title: string; url: string }): Rendered {
  return {
    subject: `${tripName}: vote — ${title}`,
    text: `The group needs to decide: ${title}\n\nVote here:\n${url}`,
    sms: sms(`${tripName} vote: ${title}`, url),
  };
}

export function documentNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `${tripName}: check your travel documents`,
    text: `One of your documents may not meet the rules for this trip. See what to do and by when:\n${url}`,
    sms: sms(`${tripName}: one of your travel documents needs attention.`, url),
  };
}

export function briefingNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `${tripName}: you leave in three days`,
    text: `Your trip starts soon. Here’s what’s confirmed and anything still open:\n${url}`,
    sms: sms(`${tripName} starts in 3 days. Your briefing:`, url),
  };
}

export function reviewHoldNotice({ tripName, url }: { tripName: string; url: string }): Rendered {
  return {
    subject: `[Hand-run] ${tripName}: playbook waiting for review`,
    text: `A playbook is held for review before it goes to the group. Edit or release it within two hours:\n${url}`,
    sms: sms(`[Hand-run] ${tripName} playbook waiting for review.`, url),
  };
}
