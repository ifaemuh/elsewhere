import type {
  SocialGraphResult,
  SocialOccasion,
  SocialPerson,
  SocialProviderCoverage,
  SocialTripInviteCard,
} from '@elsewhere/shared';

interface SocialMemoryState {
  closeFriendOverrides: Map<string, boolean>;
}

const socialState = getSocialMemoryState();

function getSocialMemoryState(): SocialMemoryState {
  const globalState = globalThis as typeof globalThis & {
    __elsewhereSocialMemoryState?: SocialMemoryState;
  };

  globalState.__elsewhereSocialMemoryState ??= {
    closeFriendOverrides: new Map<string, boolean>(),
  };

  return globalState.__elsewhereSocialMemoryState;
}

function daysFromNow(days: number): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  date.setHours(12, 0, 0, 0);
  return date.toISOString();
}

function providerCoverage(): SocialProviderCoverage[] {
  const facebookConfigured = !!process.env.FACEBOOK_APP_ID && !!process.env.FACEBOOK_CLIENT_TOKEN;
  return [
    {
      id: 'facebook',
      provider: 'facebook',
      name: 'Facebook',
      status: facebookConfigured ? 'limited' : 'missing_credentials',
      configured: facebookConfigured,
      detail: 'Can support Login and approved Graph API scopes. Friend birthdays/events require explicit permission and are limited by Meta review and friend/app consent.',
      limitations: [
        'Do not assume access to all Facebook friends or all friend birthdays.',
        'Use Facebook data only when the user grants permission and Meta approves the scope.',
      ],
    },
    {
      id: 'instagram',
      provider: 'instagram',
      name: 'Instagram',
      status: 'not_connected',
      configured: false,
      detail: 'Maps handles and shared posts to the same person when the user or friend explicitly connects the account.',
      limitations: ['No private media ingestion without the account owner connecting and consenting.'],
    },
    {
      id: 'native-share',
      provider: 'elsewhere',
      name: 'Native share invites',
      status: 'connected',
      configured: true,
      detail: 'Works through iOS/Android native share sheet for iMessage, social apps, and copy-link flows.',
      limitations: ['Recipient identity is confirmed only after they install or join the invite.'],
    },
  ];
}

function basePeople(): SocialPerson[] {
  return [
    {
      id: 'person-mia',
      displayName: 'Mia',
      avatarUrl: null,
      closeFriend: true,
      relationshipStrength: 'close',
      connectedElsewhereUserId: 'traveler-mia',
      accounts: [
        {
          provider: 'facebook',
          providerUserId: 'fb_mock_mia',
          handle: null,
          displayName: 'Mia Chen',
          profileUrl: null,
          confidence: 'high',
          verifiedSamePerson: true,
        },
        {
          provider: 'instagram',
          providerUserId: null,
          handle: '@mia.moves',
          displayName: 'Mia',
          profileUrl: 'https://instagram.com/mia.moves',
          confidence: 'high',
          verifiedSamePerson: true,
        },
      ],
      referencePhotoStatus: 'consented',
      identityConsentStatus: 'granted',
    },
    {
      id: 'person-alex',
      displayName: 'Alex',
      avatarUrl: null,
      closeFriend: true,
      relationshipStrength: 'close',
      connectedElsewhereUserId: 'traveler-alex',
      accounts: [
        {
          provider: 'facebook',
          providerUserId: 'fb_mock_alex',
          handle: null,
          displayName: 'Alex Rivera',
          profileUrl: null,
          confidence: 'high',
          verifiedSamePerson: true,
        },
        {
          provider: 'tiktok',
          providerUserId: null,
          handle: '@alexweekends',
          displayName: 'Alex',
          profileUrl: 'https://www.tiktok.com/@alexweekends',
          confidence: 'medium',
          verifiedSamePerson: false,
        },
      ],
      referencePhotoStatus: 'available',
      identityConsentStatus: 'pending',
    },
    {
      id: 'person-jordan',
      displayName: 'Jordan',
      avatarUrl: null,
      closeFriend: false,
      relationshipStrength: 'maybe_close',
      connectedElsewhereUserId: null,
      accounts: [
        {
          provider: 'facebook',
          providerUserId: 'fb_mock_jordan',
          handle: null,
          displayName: 'Jordan Lee',
          profileUrl: null,
          confidence: 'medium',
          verifiedSamePerson: true,
        },
      ],
      referencePhotoStatus: 'requested',
      identityConsentStatus: 'not_requested',
    },
  ];
}

function peopleWithOverrides(): SocialPerson[] {
  return basePeople().map((person) => ({
    ...person,
    closeFriend: socialState.closeFriendOverrides.get(person.id) ?? person.closeFriend,
  }));
}

function buildOccasions(people: SocialPerson[]): SocialOccasion[] {
  const closePersonIds = people.filter((person) => person.closeFriend).map((person) => person.id);
  return [
    {
      id: 'occasion-mia-birthday',
      kind: 'birthday',
      title: 'Mia birthday weekend',
      date: daysFromNow(44),
      sourceProvider: 'facebook',
      sourceLabel: 'Facebook birthday signal fixture',
      personIds: ['person-mia'],
      confidence: 'medium',
      limitations: ['Fixture only. Real Facebook birthday data requires approved permission and user/friend consent.'],
    },
    {
      id: 'occasion-close-friends-summer',
      kind: 'event',
      title: 'Close friends summer window',
      date: daysFromNow(72),
      sourceProvider: 'manual',
      sourceLabel: 'Close-friend filter + calendar window',
      personIds: closePersonIds,
      confidence: 'high',
      limitations: ['Suggested from close-friend settings and calendar windows, not from private social scraping.'],
    },
  ];
}

function buildInviteCards(people: SocialPerson[], occasions: SocialOccasion[]): SocialTripInviteCard[] {
  const peopleById = new Map(people.map((person) => [person.id, person]));
  return occasions.map((occasion) => {
    const invitees = occasion.personIds.map((id) => peopleById.get(id)).filter((person): person is SocialPerson => !!person);
    const needsConsent = invitees.some((person) => person.identityConsentStatus !== 'granted');
    const needsPhotos = invitees.some((person) => person.referencePhotoStatus === 'none' || person.referencePhotoStatus === 'requested');
    const destinationName = occasion.kind === 'birthday' ? 'Paris' : 'Bali';
    const names = invitees.map((person) => person.displayName).join(', ') || 'your friends';

    return {
      id: `invite-${occasion.id}`,
      occasionId: occasion.id,
      title: occasion.kind === 'birthday' ? `${names} in ${destinationName}` : `${destinationName} with your close circle`,
      subtitle: occasion.kind === 'birthday'
        ? 'A birthday trip preview built for the people you would actually invite.'
        : 'A close-friend trip idea ranked from calendar fit and group readiness.',
      destinationName,
      destinationId: destinationName === 'Paris' ? 'paris-afterglow' : 'bali-drift',
      inviteePersonIds: occasion.personIds,
      shareUrl: `https://elsewhere.app/invite/${occasion.id}`,
      shareText: `I made an Elsewhere trip preview for ${names}: ${destinationName}. Want in? https://elsewhere.app/invite/${occasion.id}`,
      previewReadiness: needsConsent ? 'needs_friend_consent' : needsPhotos ? 'needs_reference_photos' : 'ready',
    };
  });
}

export function getMockSocialGraph(filter: 'all' | 'close' = 'all'): SocialGraphResult {
  const allPeople = peopleWithOverrides();
  const people = filter === 'close' ? allPeople.filter((person) => person.closeFriend) : allPeople;
  const occasions = buildOccasions(allPeople).filter((occasion) =>
    filter === 'all' || occasion.personIds.some((personId) => allPeople.find((person) => person.id === personId)?.closeFriend),
  );

  return {
    generatedAt: new Date().toISOString(),
    providerCoverage: providerCoverage(),
    people,
    closeFriends: allPeople.filter((person) => person.closeFriend),
    occasions,
    inviteCards: buildInviteCards(allPeople, occasions),
  };
}

export function updateMockCloseFriend(personId: string, closeFriend: boolean): SocialPerson {
  const exists = basePeople().some((person) => person.id === personId);
  if (!exists) throw new Error('Social person not found');

  socialState.closeFriendOverrides.set(personId, closeFriend);
  return peopleWithOverrides().find((person) => person.id === personId)!;
}
