import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, skyReady, test } from './world';

const params = (page: Page) => new URL(page.url()).searchParams;
const poster = (page: Page) => page.getByTestId('poster');
const PARIS = '/?lat=48.85340&lon=2.34880&place=Paris&in=France&d=2025-02-14&at=22%3A00';

/** The average brightness of the chart's middle, 0 to 255. */
async function brightness(page: Page): Promise<number> {
  return poster(page).evaluate((c: HTMLCanvasElement) => {
    const s = Math.floor(c.width * 0.3);
    const d = c
      .getContext('2d')!
      .getImageData(Math.floor(c.width * 0.35), Math.floor(c.height * 0.2), s, s).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i]! + d[i + 1]! + d[i + 2]!;
    return sum / (d.length / 4) / 3;
  });
}

async function readDownload(page: Page, button: string) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: button, exact: true }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const c of await download.createReadStream()) chunks.push(c as Buffer);
  return { name: download.suggestedFilename(), body: Buffer.concat(chunks) };
}

test('opens on tonight’s sky somewhere near the visitor', async ({ page, world }) => {
  await page.goto('/');
  await skyReady(page);
  expect(world.searches).toContain('zurich'); // guessed from the Europe/Zurich time zone
  await expect(page.getByRole('img', { name: /^Star chart: the sky over Zürich/ })).toBeVisible();
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('22:00');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue(today);
  await expect(page.getByText(/Clock time in Zürich \(UTC\+[12]\)/)).toBeVisible();
  await expect.poll(() => params(page).get('place')).toBe('Zürich');
});

test('reads the time on the clocks at the place, wherever the visitor is', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.click();
  await box.fill('Sydney');
  await page.getByRole('option', { name: /Sydney/ }).click();
  // the same 22:00 on 14 February, now on a clock in Sydney, in its summer time
  await expect(page.getByText('Clock time in Sydney (UTC+11)')).toBeVisible();
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('22:00');
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Sydney');
  await expect(page.getByRole('img', { name: /the sky over Sydney/ })).toBeVisible();
  await expect.poll(() => Number(params(page).get('lat'))).toBeCloseTo(-33.8688, 3);
});

test('keeps your own title when you move the sky somewhere else', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  await page.getByLabel('Title', { exact: true }).fill('The night we met');
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.click();
  await box.fill('Gaza');
  await expect(page.getByRole('option', { name: /Gaza/ })).toBeVisible();
  await box.press('Enter');
  await expect(page.getByText('Clock time in Gaza (UTC+2)')).toBeVisible();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('The night we met');
  await expect(page.getByLabel('Line below')).toHaveValue('Palestine');
});

test('turns the sky with the clock, and plays through the night', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const slider = page.getByRole('slider', { name: 'Through the night' });
  await expect(slider).toHaveAttribute('aria-valuetext', '22:00, Friday 14 February');
  const drawn = Number(await poster(page).getAttribute('data-drawn'));

  await slider.focus();
  for (let i = 0; i < 6; i++) await slider.press('ArrowRight');
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('23:00');
  // past midnight is the next morning, still on the same night
  for (let i = 0; i < 9; i++) await slider.press('ArrowRight');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2025-02-15');
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('00:30');
  expect(Number(await poster(page).getAttribute('data-drawn'))).toBeGreaterThan(drawn);

  // the whole move undoes in one go
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue('22:00');
  await expect(page.getByLabel('Date', { exact: true })).toHaveValue('2025-02-14');

  await page.getByRole('button', { name: 'Play the night' }).click();
  await expect
    .poll(async () => page.getByLabel('Time', { exact: true }).inputValue())
    .not.toBe('22:00');
  await page.getByRole('button', { name: 'Pause' }).click();
  const paused = await page.getByLabel('Time', { exact: true }).inputValue();
  await page.waitForTimeout(400);
  await expect(page.getByLabel('Time', { exact: true })).toHaveValue(paused);
});

test('lists what is up, and says when daylight hides the stars', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const sights = page.locator('.sights');
  await expect(sights).toContainText('The Moon waning gibbous, 95% lit, low in the east');
  await expect(sights).toContainText('Jupiter');
  await expect(sights).toContainText('Mars');
  await page.getByLabel('Time', { exact: true }).fill('13:00');
  await expect(sights).toContainText('The Sun is up at this time');
});

test('restyles the poster and its thumbnails', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const dark = await brightness(page);
  expect(dark).toBeLessThan(60);
  await page.getByRole('radio', { name: 'Atlas' }).check();
  await expect.poll(() => brightness(page)).toBeGreaterThan(180);
  await expect.poll(() => params(page).get('style')).toBe('paper');
  await expect(page.locator('.style-thumb canvas[data-ready="true"]')).toHaveCount(5);
});

test('opens a link to exactly the poster it was made from', async ({ page }) => {
  await page.goto(
    `${PARIS}&t=Our+night&s=Paris+%26+us&w=0&show=lg&style=teal&font=mono&size=12x16&o=l&layout=framed`,
  );
  await skyReady(page);
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Our night');
  await expect(page.getByLabel('Line below')).toHaveValue('Paris & us');
  await expect(page.getByRole('checkbox', { name: 'Date and time' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Names' })).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Grid and ecliptic' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Deep sea' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Typewriter' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Landscape' })).toBeChecked();
  const { width, height } = await poster(page).evaluate((c: HTMLCanvasElement) => ({
    width: c.width,
    height: c.height,
  }));
  expect(width / height).toBeCloseTo(16 / 12, 2);
});

test('downloads a PNG ready to print', async ({ page }) => {
  await page.goto(`${PARIS}&size=a4&t=Paris`);
  await skyReady(page);
  const { name, body } = await readDownload(page, 'Download');
  expect(name).toBe('paris-2025-02-14-midnight.png');
  expect(body.subarray(1, 4).toString()).toBe('PNG');
  const [w, h] = [body.readUInt32BE(16), body.readUInt32BE(20)];
  expect(w / h).toBeCloseTo(210 / 297, 2);
  expect(w).toBeGreaterThanOrEqual(2100); // A4 at 300 dpi on a desktop; phones have less room
  await expect(
    page.getByRole('status').filter({ hasText: /Saved paris-2025-02-14-midnight\.png/ }),
  ).toBeVisible();
});

test('downloads an SVG with its fonts and the Milky Way inside', async ({ page }) => {
  await page.goto(`${PARIS}&size=a3&style=paper&font=sans`);
  await skyReady(page);
  const { name, body } = await readDownload(page, 'SVG');
  expect(name).toBe('paris-2025-02-14-paper.svg');
  const svg = body.toString('utf8');
  expect(svg).toContain('width="297mm" height="420mm"');
  expect(svg).toContain('@font-face{font-family:"Outfit Variable"');
  expect(svg).toContain('>ORION</text>');
  expect(svg).toContain('>Jupiter</text>');
  expect(svg).toContain('<image href="data:image/png;base64,');
  expect(svg.match(/<circle /g)!.length).toBeGreaterThan(2000);
});

test('still works when place search is down', async ({ page, world }) => {
  world.failSearch(true);
  await page.goto('/');
  await skyReady(page);
  // it could not find Zurich, so it starts in Paris, tonight
  await expect(page.getByRole('img', { name: /the sky over Paris/ })).toBeVisible();
  const box = page.getByRole('combobox', { name: 'Search for a place' });
  await box.click();
  await box.fill('Zur');
  await expect(page.getByText(/unavailable right now/).first()).toBeVisible();
});

test('fits the screen without sideways scrolling', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
  await expect(page.getByRole('button', { name: 'Download' })).toBeInViewport();
});

test('has no serious accessibility problems', async ({ page }) => {
  await page.goto(PARIS);
  await skyReady(page);
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});
