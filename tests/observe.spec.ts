import { test, expect } from '@playwright/test';

const BASE = 'http://127.0.0.1:8787';
const TOKEN = 'test-token';

function url(path: string): string {
  return `${BASE}${path}`;
}

async function post(host: string, path: string, body: object): Promise<void> {
  const response = await fetch(url(`/host/${host}${path}`), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
}

async function seedWorkItems(host: string): Promise<void> {
  await post(host, '/wis/wi-foo/upsert', { payload: 'foo' });
  await post(host, '/wis/wi-foo/mark-ready', {});
  await post(host, '/wis/wi-foo/claim', { by: 'dev', duration: 60000 });
  await post(host, '/wis/wi-bar/upsert', { payload: 'bar' });
  await post(host, '/wis/wi-bar/claim', { by: 'ops', duration: 60000 });
  await post(host, '/wis/wi-foo/close', { by: 'dev', evidence: 'done' });
  await post(host, '/wis/wi-bar/expire', {});
}

async function setToken(page): Promise<void> {
  await page.addInitScript((token: string) => {
    localStorage.setItem('cooknship-book-token', token);
  }, TOKEN);
}

test('Observe page renders live events and descriptor footer', async ({ page }) => {
  const host = 'acme';
  await seedWorkItems(host);
  await setToken(page);
  await page.goto(`${BASE}/?host=${host}&pollMs=200`);

  await expect(page.locator('#event-count')).toContainText('7 events · 2 tickets', { timeout: 5000 });

  const stations = page.locator('.station');
  await expect(stations).toHaveCount(5);

  const spec = stations.nth(0);
  const doing = stations.nth(1);
  const review = stations.nth(2);
  const done = stations.nth(3);
  const ship = stations.nth(4);

  await expect(spec).toContainText('wi-bar');
  await expect(spec.locator('.token.expired')).toBeVisible();
  await expect(doing).toContainText('quiet');
  await expect(review).toContainText('quiet');
  await expect(done).toContainText('wi-foo');
  await expect(ship).toContainText('quiet');

  await expect(page.locator('a[href="/descriptor"]')).toBeVisible();

  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await expect(page.locator('button:has-text("claim")')).toHaveCount(0);
  await expect(page.locator('button:has-text("close")')).toHaveCount(0);
  await expect(page.locator('button:has-text("mark-ready")')).toHaveCount(0);
  await expect(page.locator('button:has-text("admit")')).toHaveCount(0);
  await expect(page.locator('button:has-text("park")')).toHaveCount(0);
  await expect(page.locator('button:has-text("rank")')).toHaveCount(0);
});

test('shows unreachable-host banner when events fail', async ({ page }) => {
  const host = 'offline';
  await setToken(page);
  await page.route(`**/host/${host}/events*`, (route) => route.abort());
  await page.goto(`${BASE}/?host=${host}&pollMs=200`);

  await expect(page.locator('#banner')).not.toHaveClass(/hidden/);
  await expect(page.locator('#banner')).toContainText('Host unreachable');
});
