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

test('after a new deploy, an online visit loads the new page, not a stale cached one', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  // Pretend the cache holds the page from an older deploy, pointing at a JS file that no longer exists.
  await page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      await c.put(new URL('./', location.href).href, new Response('<!doctype html><div id="app"></div><script type="module" src="assets/gone-old.js"></script>', { headers: { 'content-type': 'text/html' } }));
    }
  });
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
});
