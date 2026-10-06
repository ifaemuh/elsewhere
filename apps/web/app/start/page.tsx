import { redirect } from 'next/navigation';

// Trips are closed; old links to the trip pitch land on the rules.
export default function StartPage() {
  redirect('/rules');
}
