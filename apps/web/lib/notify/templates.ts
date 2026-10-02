export interface Rendered {
  subject: string;
  text: string;
  sms: string;
}

function sms(body: string, url: string): string {
  const prefix = 'Elsewhere: ';
  const room = 320 - prefix.length - url.length - 1;
  return `${prefix}${body.length > room ? `${body.slice(0, room - 1)}…` : body} ${url}`;
}

export function incidentNotice({ tripName, headline, url }: { tripName: string; headline: string; url: string }): Rendered {
  return {
    subject: `${tripName}: ${headline}`,
    text: `${headline}\n\nWe drafted what you’re owed and what to send, with the rules cited:\n${url}\n\nElsewhere drafts; you decide and send. Not legal advice.`,
    sms: sms(headline, url),
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
