import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/api/v1/health');
}
