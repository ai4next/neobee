

import { NextIntlClientProvider } from 'next-intl';
import { ReactNode } from 'react';

export function Providers({ children, locale, messages }: { children: ReactNode; locale: string; messages: Record<string, unknown> }) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
