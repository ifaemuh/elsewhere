import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/guard', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/admin/sweep', () => ({ stuckIncidents: vi.fn(), stuckMessages: vi.fn() }));
vi.mock('@/app/admin/actions', () => ({}));

import AdminPage from '@/app/admin/page';

function types(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => types(n, found));
  else if (node && typeof node === 'object' && 'type' in node) {
    const element = node as { type: unknown; props?: { children?: unknown } };
    if (typeof element.type === 'string') found.push(element.type);
    types(element.props?.children, found);
  }
  return found;
}

describe('AdminPage', () => {
  it('renders nothing before the guard: the heading lives inside the guarded content', () => {
    expect(types(AdminPage())).not.toContain('h1');
  });
});
