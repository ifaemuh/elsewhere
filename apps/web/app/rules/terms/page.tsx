import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rules API and MCP terms of use · Elsewhere',
  description: 'Terms for using Elsewhere’s verified travel rules through the API and MCP server.',
};

export default function RulesTermsPage() {
  const partnerContact = process.env.NEXT_PUBLIC_PARTNER_CONTACT?.trim();
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <h1 className="text-3xl font-semibold">Rules API and MCP terms of use</h1>
      <p>
        Elsewhere publishes travel rules verified word-for-word against primary sources. These terms cover the public
        API at <code>/api/rules</code> and the MCP server at <code>/api/mcp</code>.
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Information, not legal advice</h2>
        <p>
          Rules are informational and are not legal advice. Check the cited source before relying on a rule. Rules
          marked <code>needs_review</code> are being re-checked after a source change and may be out of date.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Attribution is required</h2>
        <p>
          When you show or use a rule, show the attribution text — “Rules verified by Elsewhere from primary sources.
          Not legal advice.” — and link the rule’s <code>page_url</code>.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">AI agents</h2>
        <p>AI agents may answer their users from this data, with attribution and a link to the rule page.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Rate limits</h2>
        <p>
          Without a key, each IP address may make 60 API requests per minute and 30 MCP requests per minute. Partners
          get higher limits with a key.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">What we log</h2>
        <p>
          We log calls to count usage and find gaps in our rules. IP addresses are never stored. Search queries are
          stored truncated to 200 characters, with email addresses and phone numbers replaced by [redacted]. For
          situation matching we store only the names of the facts you send, never their values.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Bulk use and partner keys</h2>
        <p>
          Bulk redistribution or resale of the rules needs a partner key.{' '}
          {partnerContact ? (
            <>
              To request one, contact <a className="underline" href={`mailto:${partnerContact}`}>{partnerContact}</a>.
            </>
          ) : (
            <>Partner keys aren’t open yet.</>
          )}
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">No warranty</h2>
        <p>The data is provided as is, without warranty of any kind, and may change at any time.</p>
      </section>
    </main>
  );
}
