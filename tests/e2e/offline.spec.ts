import { expect, test } from './helpers';

// The one test that lets the service worker run: once loaded, the game works offline.
test.use({ serviceWorkers: 'allow' });

test('plays offline after the first visit (PWA service worker)', async ({ page, context }) => {
  await page.goto('/');
  // Automated browsers skip auto-registration, so register it the same way the game does.
  await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await page.reload(); // now served through the worker, which caches every file it sees
  await expect(page.getByTestId('title')).toBeVisible();
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  await context.setOffline(false);
});
