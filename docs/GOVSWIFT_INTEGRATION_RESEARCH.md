# GovSwift Integration Research

Date: 2026-05-01

## What GovSwift Offers

GovSwift is a third-party government-form assistance service, not a government agency. Its public site positions the company around guided document preparation, instructions, and support for U.S. passports, Global Entry, TSA PreCheck, ESTA, NEXUS, SENTRI, U.S. visas, Social Security cards, birth certificates, and green cards.

The strongest Elsewhere fit is the travel-admin layer:

- Passport renewals, new passports, lost/stolen passports, child passports, damaged passports.
- Trusted traveler programs: Global Entry, TSA PreCheck, NEXUS, SENTRI.
- Trip-timed urgency: GovSwift’s passport flow asks for known travel plans and offers standard or rushed options.
- Add-ons such as passport card, protection, shipping label, expedited passport markings, Global Entry/TSA PreCheck cross-sells.

## Integration Shape

Start as a partner handoff/referral, not a deep API assumption:

1. Elsewhere stores document expiration dates and trip deadlines.
2. Assist detects risk: passport expiry, missing Global Entry/TSA PreCheck, visa/ESTA needs, or trip date too close.
3. Elsewhere shows a travel-admin card inside the trip feed or Profile.
4. CTA opens GovSwift with tagged referral parameters and preselected service type where possible.
5. User completes GovSwift’s flow directly with GovSwift.

Later partner API/deep-link asks:

- Service catalog endpoint or static mapping.
- Preselect service type: passport renewal, new passport, Global Entry, TSA PreCheck.
- Referral attribution.
- Status callback/webhook for “application started,” “forms ready,” “user needs to mail documents,” “support required.”
- Compliance-approved copy and disclosures.

## Product Rules

- Never represent GovSwift as a government agency.
- Always disclose that official forms are available through government websites and GovSwift charges a service fee for guidance/form preparation.
- Do not collect SSN/passport numbers for GovSwift handoff until a formal partner agreement and security review exist.
- Keep sensitive document storage in Elsewhere limited to expiration dates, country, document type, and user-controlled reminders unless/until security scope expands.

## Sources

- GovSwift homepage: https://govswift.com/
- GovSwift passport service page: https://govswift.com/services/passport/
- GovSwift services directory: https://govswift.com/services/
- GovSwift passport flow: https://passport.govswift.com/
