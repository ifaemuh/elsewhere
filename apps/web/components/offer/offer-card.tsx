import { OfferCta } from './offer-cta';

export function OfferCard({ ruleId, priceLabel }: { ruleId: string; priceLabel: string }) {
  return (
    <section aria-labelledby="offer-heading" className="mt-12 rounded-2xl border border-[#e4dfd0] bg-white p-6">
      <h2 id="offer-heading" className="text-xl font-bold">
        Forward your group’s bookings and we’ll watch the trip.
      </h2>
      <p className="mt-2 text-[#4b5745]">
        Free: we read your confirmations, build the itinerary, and check everyone’s documents.
      </p>
      <p className="mt-2 text-[#4b5745]">
        Trip pass, {priceLabel} for the whole group: we watch every flight and tell the affected people what they’re owed, with the rule
        cited. We draft the messages; you send them.
      </p>
      <OfferCta ruleId={ruleId} />
    </section>
  );
}
