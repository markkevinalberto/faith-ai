import { Redirect } from 'expo-router';

import { useApp } from '@/state/AppState';

export default function Index() {
  const { profile } = useApp();
  return <Redirect href={profile ? '/home' : '/onboarding'} />;
}
