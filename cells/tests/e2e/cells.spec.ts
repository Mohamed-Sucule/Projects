import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/* The spreadsheet as people use it: with the keyboard, the mouse and a finger, in two tabs
   at once, and with a screen reader's view of the grid checked by axe. */

const ready = async (page: Page) => {
  await page.goto('/');
  await expect(page.locator('.loading')).toHaveCount(0);
};

/** What a cell shows, from the grid itself. */
const shown = (page: Page, ref: string) => {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)!;
  let col = 0;
  for (const ch of m[1]!) col = col * 26 + ch.charCodeAt(0) - 64;
  return page.locator(`#cell-${Number(m[2]) - 1}-${col - 1}`);
};

/** Go somewhere with the name box, as a keyboard user would. */
async function goTo(page: Page, ref: string) {
  const box = page.getByLabel('Go to a cell or range');
  await box.click();
  await box.fill(ref);
  await box.press('Enter');
  await expect(page.getByRole('grid')).toBeFocused();
}

async function type(page: Page, ref: string, text: string) {
  await goTo(page, ref);
  await page.keyboard.type(text);
  await page.keyboard.press('Enter');
}

const bar = (page: Page) => page.getByLabel(/^Contents of /);
const status = (page: Page) => page.getByRole('status');

async function noSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(
    serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
}

test.describe('with a keyboard and a mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'keyboard and mouse');

  test('a changed price flows through every lookup and total that depends on it', async ({
    page,
  }) => {
    await ready(page);
    await expect(shown(page, 'N10')).toHaveText('£515,026.25');
    await goTo(page, 'J4');
    await expect(bar(page)).toHaveValue('4.5');
    await page.keyboard.type('5');
    await page.keyboard.press('Enter');
    await expect(shown(page, 'J4')).toHaveText('£5.00');
    await expect(page.getByLabel('Go to a cell or range')).toHaveValue('J5');
    await expect(shown(page, 'N10')).not.toHaveText('£515,026.25');
    await expect(page.locator('.recalc')).toContainText(/Recalculated 6,0\d\d cells/);

    await page.keyboard.press('Control+z');
    await expect(shown(page, 'J4')).toHaveText('£4.50');
    await expect(shown(page, 'N10')).toHaveText('£515,026.25');
    await expect(status(page)).toHaveText('Undid typing in J4');
    await page.keyboard.press('Control+y');
    await expect(shown(page, 'J4')).toHaveText('£5.00');
  });

  test('arrow keys point at cells while a formula is typed', async ({ page }) => {
    await ready(page);
    await goTo(page, 'R4');
    await page.keyboard.type('=SUM(');
    for (let i = 0; i < 14; i++) await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    const editor = page.getByLabel('Editing R4');
    await expect(editor).toHaveValue('=SUM(D4:D6');
    await expect(page.locator('.overlay .ref')).toHaveCount(1);
    await page.keyboard.press('Enter'); // the bracket closes itself
    await expect(shown(page, 'R4')).toHaveText('51');
    await goTo(page, 'R4');
    await expect(bar(page)).toHaveValue('=SUM(D4:D6)');
  });

  test('suggests functions, and shows which argument is being typed', async ({ page }) => {
    await ready(page);
    await goTo(page, 'R5');
    await page.keyboard.type('=aver');
    const list = page.getByRole('listbox', { name: 'Functions' });
    await expect(list.getByRole('option')).toHaveText([/^AVERAGE/, /^AVERAGEIF/, /^AVERAGEIFS/]);
    await expect(page.getByLabel('Editing R5')).toHaveAttribute(
      'aria-activedescendant',
      'fx-option-0',
    );
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Editing R5')).toHaveValue('=AVERAGE(');
    await expect(page.getByRole('note')).toContainText('AVERAGE(number1, [number2], …)');
    await page.keyboard.type('D4:D9');
    await page.keyboard.press('Enter');
    await expect(shown(page, 'R5')).toHaveText('17.66666667');
  });

  test('explains errors and circular references', async ({ page }) => {
    await ready(page);
    await type(page, 'R6', '=1/0');
    await expect(shown(page, 'R6')).toHaveText('#DIV/0!');
    await expect(status(page)).toHaveText(/R6 shows #DIV\/0!: it divides by zero/);
    await type(page, 'R7', '=R8+1');
    await type(page, 'R8', '=R7+1');
    await expect(shown(page, 'R7')).toHaveText('#CYCLE!');
    await expect(shown(page, 'R8')).toHaveText('#CYCLE!');
    await type(page, 'R8', '5');
    await expect(shown(page, 'R7')).toHaveText('6');
  });

  test('goes to the last of 1,048,576 rows and back', async ({ page }) => {
    await ready(page);
    const grid = page.getByRole('grid');
    await expect(grid).toHaveAttribute('aria-rowcount', '1048577');
    await goTo(page, 'S1');
    await page.keyboard.press('Control+ArrowDown');
    await expect(page.getByLabel('Go to a cell or range')).toHaveValue('S1048576');
    await page.keyboard.type('the end');
    await page.keyboard.press('Enter');
    await expect(shown(page, 'S1048576')).toHaveText('the end');
    await expect(page.getByRole('rowheader', { name: '1048576' })).toBeVisible();
    // the screen reader is told where the cursor is, wherever it goes
    await expect(grid).toHaveAttribute('aria-activedescendant', 'cell-1048575-18');
    await page.keyboard.press('Control+Home');
    await expect(page.getByLabel('Go to a cell or range')).toHaveValue('A1');
    await expect(shown(page, 'A1')).toBeVisible();
  });

  test('the fill handle carries a series on', async ({ page }) => {
    await ready(page);
    await type(page, 'R4', '1');
    await type(page, 'R5', '3');
    await goTo(page, 'R4:R5');
    const handle = await page.locator('.handle').boundingBox();
    await page.mouse.move(handle!.x + 4, handle!.y + 4);
    await page.mouse.down();
    await page.mouse.move(handle!.x + 4, handle!.y + 4 + 24 * 4, { steps: 6 });
    await page.mouse.up();
    await expect(shown(page, 'R6')).toHaveText('5');
    await expect(shown(page, 'R9')).toHaveText('11');
    await expect(status(page)).toHaveText('Filling R4:R9');
  });

  test('cut and paste moves cells, and formulas follow them', async ({ page }) => {
    await ready(page);
    await type(page, 'R4', '20');
    await type(page, 'S4', '=R4*2');
    await goTo(page, 'R4');
    await page.keyboard.press('Control+x');
    await expect(page.locator('.overlay .clip.cut')).toHaveCount(1);
    await goTo(page, 'R10');
    await page.keyboard.press('Control+v');
    await expect(shown(page, 'R10')).toHaveText('20');
    await expect(shown(page, 'R4')).toHaveText('');
    await goTo(page, 'S4');
    await expect(bar(page)).toHaveValue('=R10*2');
    await expect(shown(page, 'S4')).toHaveText('40');
  });

  test('inserting a row moves every reference below it', async ({ page }) => {
    await ready(page);
    await goTo(page, 'A4');
    await page.keyboard.press('Control+=');
    await expect(shown(page, 'A4')).toHaveText('');
    await expect(shown(page, 'A5')).toHaveText('01/01/2025');
    await goTo(page, 'N11');
    await expect(bar(page)).toHaveValue('=SUM(N5:N10)');
    await expect(shown(page, 'N11')).toHaveText('£515,026.25');
  });

  test('sorts a table by the column the cursor is in, keeping its heading', async ({ page }) => {
    await ready(page);
    await goTo(page, 'I3:K9');
    await page.keyboard.press('Tab'); // to J3: sort by price
    await page.getByRole('button', { name: 'Sort Z to A by this column' }).click();
    await expect(shown(page, 'I3')).toHaveText('Product');
    await expect(shown(page, 'I4')).toHaveText('Backpack');
    await expect(shown(page, 'J4')).toHaveText('£48.00');
    await expect(shown(page, 'I9')).toHaveText('Notebook');
    // the orders still find their prices
    await expect(shown(page, 'F4')).toHaveText('£96.00');
  });

  test('the right-click menu acts on the cell clicked', async ({ page }) => {
    await ready(page);
    await shown(page, 'F5').click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Cell actions' });
    await expect(menu.getByRole('menuitem', { name: 'Delete row 5' })).toBeVisible();
    await noSeriousAxe(page);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('grid')).toBeFocused();
  });

  test('saves the sheet as CSV and opens one', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('menuitem', { name: /^Monthly budget/ }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Save CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('Monthly budget.csv');

    const csv = 'Name,Amount\r\n"Rent, flat",900\r\nFood,250.5\r\n';
    await page
      .locator('input[type=file]')
      .setInputFiles({ name: 'spending.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(shown(page, 'A2')).toHaveText('Rent, flat');
    await expect(page.getByLabel('Workbook name')).toHaveValue('spending');
    await type(page, 'B4', '=SUM(B2:B3)');
    await expect(shown(page, 'B4')).toHaveText('1150.5');
  });

  test('two tabs edit the same sheet live', async ({ page, context }) => {
    await ready(page);
    const other = await context.newPage();
    await ready(other);
    await expect(page.locator('.peers')).toHaveText('2 tabs, live');
    await type(other, 'P20', 'from the other tab');
    await expect(shown(page, 'P20')).toHaveText('from the other tab');
    // and where the other tab's cursor is, with its name
    await expect(page.locator('.overlay .other')).toHaveCount(1);
    await type(page, 'J4', '6');
    await expect(shown(other, 'J4')).toHaveText('£6.00');
    await expect(shown(other, 'F8')).toHaveText('£174.00'); // 29 notebooks at the new price
  });

  test('keeps the sheet after a reload', async ({ page }) => {
    await ready(page);
    await type(page, 'R4', 'kept');
    await page.waitForTimeout(800); // saving waits for a pause
    await page.reload();
    await expect(page.locator('.loading')).toHaveCount(0);
    await expect(shown(page, 'R4')).toHaveText('kept');
  });

  test('has no serious accessibility problems, with the editor open or not', async ({ page }) => {
    await ready(page);
    await noSeriousAxe(page);
    await goTo(page, 'R4');
    await page.keyboard.type('=SU');
    await expect(page.getByRole('listbox', { name: 'Functions' })).toBeVisible();
    await noSeriousAxe(page);
  });
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch');

  test('a tap selects, a second tap edits', async ({ page }) => {
    await ready(page);
    await shown(page, 'D6').tap();
    await expect(page.getByLabel('Go to a cell or range')).toHaveValue('D6');
    await page.waitForTimeout(250);
    await shown(page, 'D6').tap();
    const editor = page.getByLabel('Editing D6');
    await expect(editor).toBeFocused();
    await editor.fill('99');
    await editor.press('Enter');
    await expect(shown(page, 'D6')).toHaveText('99');
    await expect(shown(page, 'F6')).toHaveText('£4,752.00');
  });

  test('fits the screen, with nothing off its edge', async ({ page }) => {
    await ready(page);
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await expect(page.getByRole('button', { name: 'Save CSV' })).toBeInViewport();
    await noSeriousAxe(page);
  });
});
