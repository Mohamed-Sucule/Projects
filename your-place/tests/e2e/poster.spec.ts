import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, posterReady, test } from './world';

const params = (page: Page) => new URL(page.url()).searchParams;

/** Distinct colours across a sample of the poster's pixels: a blank map has a handful. */
async function variety(page: Page): Promise<number> {
  return page.locator('[data-testid="poster"]').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.floor(c.height * 0.6)).data;
    const seen = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 61)
      seen.add((d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!);
    return seen.size;
  });
}

test('opens on a poster of somewhere near the visitor, drawn from real map data', async ({
  page,
  world,
}) => {
  await page.goto('/');
  await posterReady(page);
  expect(world.searches).toContain('zurich'); // guessed from the Europe/Zurich time zone
  await expect(
    page.getByRole('img', { name: /Poster of Zürich, Switzerland, Paper style/ }),
  ).toBeVisible();
  expect(await variety(page)).toBeGreaterThan(200);
  expect(world.tiles.length).toBeGreaterThan(10);
  expect(world.tiles.length).toBeLessThanOrEqual(60);
  await expect.poll(() => params(page).get('t')).toBe('Zürich');
});

test('finds a place by typing and choosing with the keyboard', async ({ page }) => {
  await page.goto('/');
  await posterReady(page);
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.click();
  await box.fill('Belle');
  const option = page.getByRole('option', { name: /Bellevueplatz/ });
  await expect(option).toBeVisible();
  await expect(page.getByText('1 place found. Use up and down to choose.')).toBeAttached();
  await box.press('Enter');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.getByLabel('Title')).toHaveValue('Bellevueplatz');
  await expect(page.getByLabel('Line below')).toHaveValue('Zürich, Switzerland');
  await expect.poll(() => Number(params(page).get('lat'))).toBeCloseTo(47.3667, 3);
  await expect.poll(() => Number(params(page).get('z'))).toBeCloseTo(15.2, 1);
});

test('says so when nothing matches', async ({ page }) => {
  await page.goto('/');
  await posterReady(page);
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.click();
  await box.fill('Qqqxyz');
  await expect(page.getByText(/Nothing by that name/)).toBeVisible();
  await box.press('Escape');
  await expect(page.getByText(/Nothing by that name/)).toBeHidden();
});

test('restyles the poster, with each style previewed on your own place', async ({ page }) => {
  await page.goto('/');
  await posterReady(page);
  await expect(page.locator('.style-thumb canvas[data-ready="true"]')).toHaveCount(7, {
    timeout: 30_000,
  });
  await page.getByRole('radio', { name: 'Noir & gold' }).check();
  await expect(page.getByRole('img', { name: /Noir & gold style/ })).toBeVisible();
  await expect.poll(() => params(page).get('style')).toBe('noir');
  // once repainted, the top of a noir poster is dark
  const brightness = () =>
    page.locator('[data-testid="poster"]').evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.floor(c.height / 5)).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
      return sum / (d.length / 4);
    });
  await expect.poll(brightness).toBeLessThan(70);
});

test('moves with drags, wheels and keys, and undoes a whole drag at once', async ({
  page,
}, info) => {
  test.skip(info.project.name === 'phone', 'mouse and keyboard');
  await page.goto('/');
  await posterReady(page);
  await expect.poll(() => params(page).get('lon')).not.toBeNull();
  const start = { lon: Number(params(page).get('lon')), z: Number(params(page).get('z')) };
  const poster = page.locator('[data-testid="poster"]');
  const b = (await poster.boundingBox())!;

  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 3);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++)
    await page.mouse.move(b.x + b.width / 2 - i * 15, b.y + b.height / 3);
  await page.mouse.up();
  await expect.poll(() => Number(params(page).get('lon'))).toBeGreaterThan(start.lon + 0.005);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => Number(params(page).get('lon'))).toBeCloseTo(start.lon, 4);

  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 3);
  await page.mouse.wheel(0, -300);
  await expect.poll(() => Number(params(page).get('z'))).toBeGreaterThan(start.z + 0.3);

  await poster.focus();
  const z = Number(params(page).get('z'));
  await page.keyboard.press('-');
  await expect.poll(() => Number(params(page).get('z'))).toBeCloseTo(z - 0.5, 1);
  const lat = Number(params(page).get('lat'));
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => Number(params(page).get('lat'))).toBeGreaterThan(lat);
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => Number(params(page).get('lat'))).toBeCloseTo(lat, 4);
});

test('a link reopens exactly the same poster', async ({ page, context }) => {
  await page.goto('/');
  await posterReady(page);
  await page.getByRole('radio', { name: 'Blueprint' }).check();
  await page.getByLabel('Title').fill('Where we met');
  await page.getByRole('radio', { name: 'With a border' }).check();
  await expect.poll(() => params(page).get('layout')).toBe('framed');
  const link = page.url();

  const again = await context.newPage();
  await again.goto(link);
  await posterReady(again);
  await expect(
    again.getByRole('img', { name: /Poster of Where we met.*Blueprint style/ }),
  ).toBeVisible();
  await expect(again.getByRole('radio', { name: 'With a border' })).toBeChecked();
  await expect(again.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('downloads a print-ready PNG of the right size', async ({ page }) => {
  await page.goto(
    '/?lat=47.37445&lon=8.54104&z=13.2&t=Z%C3%BCrich&s=Switzerland&size=a4&style=terracotta',
  );
  await posterReady(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('zurich-terracotta-a4.png');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const png = Buffer.concat(chunks);
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
  // A4 at 300 dpi on a desktop; phones get a smaller budget
  expect(w / h).toBeCloseTo(210 / 297, 2);
  expect(w).toBeGreaterThanOrEqual(2100);
  expect(png.length).toBeGreaterThan(500_000);
  await expect(
    page.getByRole('status').filter({ hasText: /Saved zurich-terracotta-a4\.png/ }),
  ).toBeVisible();
});

test('downloads an SVG with the fonts and the credit in it', async ({ page }) => {
  await page.goto(
    '/?lat=47.37445&lon=8.54104&z=13.6&t=Z%C3%BCrich&s=Switzerland&size=a3&style=golden-hour&font=serif',
  );
  await posterReady(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'SVG' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('zurich-golden-hour-a3.svg');
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  const svg = Buffer.concat(chunks).toString('utf8');
  expect(svg).toContain('width="297mm" height="420mm"');
  expect(svg).toContain('@font-face{font-family:"Fraunces Variable"');
  expect(svg).toContain('>ZÜRICH</text>');
  expect(svg).toContain('© OpenStreetMap contributors');
  expect(svg).toContain('<filter id="glow"');
  expect(svg.length).toBeGreaterThan(200_000);
});

test('says when the map cannot load, and recovers', async ({ page, world }) => {
  world.failTiles(true);
  await page.goto('/?lat=47.37445&lon=8.54104&z=13.2&t=Z%C3%BCrich');
  await expect(page.getByRole('alert')).toContainText('The map didn’t load.');
  world.failTiles(false);
  await page.getByRole('button', { name: 'Try again' }).click();
  await posterReady(page);
  await expect(page.getByRole('alert')).toBeHidden();
  expect(await variety(page)).toBeGreaterThan(200);
});

test('fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await posterReady(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expect(page.getByRole('button', { name: 'Download' })).toBeInViewport();
});

test('has no serious accessibility problems', async ({ page }) => {
  await page.goto('/');
  await posterReady(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});

test('follows a finger, and two fingers pinch to zoom', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch');
  await page.goto('/?lat=47.37445&lon=8.54104&z=13.2&t=Z%C3%BCrich');
  await posterReady(page);
  const poster = page.locator('[data-testid="poster"]');
  const b = (await poster.boundingBox())!;
  const at = (dx: number, dy: number) => ({
    clientX: b.x + b.width / 2 + dx,
    clientY: b.y + b.height / 3 + dy,
  });
  const touch = (type: string, id: number, dx: number, dy: number) =>
    poster.dispatchEvent(type, {
      pointerId: id,
      pointerType: 'touch',
      isPrimary: id === 1,
      button: 0,
      buttons: 1,
      bubbles: true,
      ...at(dx, dy),
    });

  await touch('pointerdown', 1, 0, 0);
  for (let i = 1; i <= 6; i++) await touch('pointermove', 1, 0, i * 12);
  await touch('pointerup', 1, 0, 72);
  await expect.poll(() => Number(params(page).get('lat'))).toBeGreaterThan(47.376);

  await touch('pointerdown', 1, -40, 0);
  await touch('pointerdown', 2, 40, 0);
  for (let i = 1; i <= 6; i++) {
    await touch('pointermove', 1, -40 - i * 10, 0);
    await touch('pointermove', 2, 40 + i * 10, 0);
  }
  await touch('pointerup', 1, -100, 0);
  await touch('pointerup', 2, 100, 0);
  // fingers 80 px apart spread to 200: two and a half times closer, about 1.3 zoom levels
  await expect.poll(() => Number(params(page).get('z'))).toBeCloseTo(13.2 + Math.log2(200 / 80), 1);
});
