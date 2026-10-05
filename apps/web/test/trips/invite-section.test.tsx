import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { currentJoinLink } = vi.hoisted(() => ({ currentJoinLink: vi.fn() }));
vi.mock('@/app/trips/[id]/actions', () => ({ currentJoinLink, resetJoinLink: vi.fn() }));

import { InviteSection } from '@/app/trips/[id]/invite-section';

/** Flatten a server-rendered element tree into its text and element type names. */
function text(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join(' ');
  const element = node as { type: unknown; props: { children?: ReactNode } };
  const name = typeof element.type === 'string' ? `<${element.type}>` : '';
  return `${name} ${text(element.props.children)}`;
}

beforeEach(() => {
  currentJoinLink.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('InviteSection', () => {
  it('renders nothing for a member, and never asks for the link', async () => {
    expect(await InviteSection({ tripId: 't', isPlanner: false, failed: false })).toBeNull();
    expect(currentJoinLink).not.toHaveBeenCalled();
  });

  it('degrades, with a logged message and no button, when the link cannot be read', async () => {
    currentJoinLink.mockRejectedValue(new Error('Missing required environment variable JOIN_LINK_SECRET'));
    const out = text(await InviteSection({ tripId: 't', isPlanner: true, failed: false }));
    expect(out).toContain("Invite links aren't available right now.");
    expect(out).not.toContain('<form>');
    expect(console.error).toHaveBeenCalledWith('currentJoinLink failed', 'Missing required environment variable JOIN_LINK_SECRET');
  });

  it('shows the link and a reset button', async () => {
    currentJoinLink.mockResolvedValue('https://elsewhere.test/join/abc');
    const out = text(await InviteSection({ tripId: 't', isPlanner: true, failed: false }));
    expect(out).toContain('https://elsewhere.test/join/abc');
    expect(out).toContain('Reset the link');
  });

  it('shows a short note after a failed create', async () => {
    currentJoinLink.mockResolvedValue(null);
    const out = text(await InviteSection({ tripId: 't', isPlanner: true, failed: true }));
    expect(out).toContain('Create invite link');
    expect(out).toContain("couldn't make a new link");
  });
});
