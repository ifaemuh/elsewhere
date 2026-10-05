import { FTC_DISCLOSURE, type AffiliateOffer } from '@/lib/affiliate/offers';

export function AffiliateOffers({ offers }: { offers: AffiliateOffer[] }) {
  if (offers.length === 0) return null;
  return (
    <section aria-labelledby="offers-heading" className="mt-10 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <p className="text-sm text-[#4b5745]">{FTC_DISCLOSURE}</p>
      <h2 id="offers-heading" className="mt-4 text-xl font-semibold">
        Options that include this
      </h2>
      <ul className="mt-3 space-y-3">
        {offers.map((offer) => (
          <li key={offer.id}>
            <a href={offer.href} rel="sponsored noopener" target="_blank" className="font-medium text-[#b4532a] underline">
              {offer.label}
            </a>
            {offer.note ? <p className="text-sm text-[#4b5745]">{offer.note}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
