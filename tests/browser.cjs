// End-to-end Playwright browser test against production Angular dist/ output. Usage: npm run test:browser
const { chromium } = require('playwright');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { DIST_ROOT, start } = require('../scripts/serve-dist.cjs');

const PORT = 4183;
const URL = `http://localhost:${PORT}/`;
const OUT = path.join(__dirname, '..', 'test-output');
const WEDNESDAY = new Date('2026-11-11T09:00:00');

const nav = (page, name) => page.locator('nav button', { hasText: name }).click();
const exercise = (page, id) => page.locator(`[data-exercise="${id}"]`);
const tick = (page, id, n) => exercise(page, id).locator('.tick').nth(n);
const weight = (page, id, n) => exercise(page, id).locator('.set:not(.head)').nth(n).locator('input').first();
const prevDay = page => page.getByRole('button', { name: 'Previous day' }).click();
const nextDay = page => page.getByRole('button', { name: 'Next day' }).click();
const testId = (page, id) => page.locator(`[data-testid="${id}"]`);

async function waitText(loc, expected) {
  await loc.filter({ hasText: expected }).waitFor();
  assert.equal((await loc.textContent()).trim(), expected);
}

async function noOverflow(page, label) {
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(wide <= 0, `${label} overflows sideways by ${wide}px`);
}

(async () => {
  assert.ok(fs.existsSync(path.join(DIST_ROOT, 'index.html')), 'dist index.html missing — run npm run build first');
  assert.ok(fs.existsSync(path.join(DIST_ROOT, 'ngsw-worker.js')), 'ngsw-worker.js missing from dist');
  assert.ok(fs.existsSync(path.join(DIST_ROOT, 'ngsw.json')), 'ngsw.json missing from dist');

  fs.mkdirSync(OUT, { recursive: true });
  const server = await start(PORT);
  const browser = await chromium.launch()
    .catch(() => chromium.launch({ channel: 'chrome' }))
    .catch(() => chromium.launch({ channel: 'msedge' }));
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  context.on('request', r => { if (!r.url().startsWith(URL) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  await page.clock.install({ time: WEDNESDAY });

  // First run asks for a start date and offers next Monday.
  await page.goto(URL);
  await page.getByRole('heading', { name: 'Start your 12 weeks' }).waitFor();
  assert.equal(await page.locator('input[type=date]').inputValue(), '2026-11-16');
  await page.locator('input[type=date]').fill('2026-11-09');
  await page.getByRole('button', { name: 'Start the plan' }).click();

  // Wednesday is a gym day in week 1 with all six exercises.
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  assert.ok(await page.getByText('Week 1 of 12').isVisible());
  assert.equal(await page.locator('.exercise').count(), 6);
  await waitText(testId(page, 'set-count'), '0 of 12 sets');
  assert.ok(await page.getByRole('button', { name: 'Next day' }).isDisabled(), 'future days cannot be logged');
  await noOverflow(page, 'Today');

  // Drawings, muscle diagrams, and animation controls.
  assert.equal(await page.locator('.exercise .art-thumb').count(), 6);
  assert.equal(await page.locator('.exercise .muscle-map').count(), 6);
  const legArt = exercise(page, 'leg-press').getByRole('img', { name: 'Leg press: animated demonstration' });
  const artLabel = legArt.locator('.art-label');
  const artShape = () => exercise(page, 'leg-press').locator('.art-anim').evaluate(e => e.innerHTML);
  assert.equal(await legArt.isVisible(), false);
  await page.getByRole('button', { name: 'Show how to do Leg press' }).click();
  await legArt.waitFor({ state: 'visible' });
  await noOverflow(page, 'Today with a drawing open');
  const firstFrame = await artShape();
  await page.clock.runFor(450);
  await waitText(artLabel, 'Push out');
  assert.notEqual(await artShape(), firstFrame, 'the drawing moves');
  await page.clock.runFor(650);
  await waitText(artLabel, 'Pause');
  await page.clock.runFor(500);
  await waitText(artLabel, 'Lower with control');
  await page.getByRole('button', { name: 'Pause Leg press demonstration' }).click();
  await page.getByRole('button', { name: 'Play Leg press demonstration' }).waitFor();
  const paused = await artShape();
  await page.clock.runFor(500);
  assert.equal(await artShape(), paused, 'pause holds the drawing still');
  await page.getByRole('button', { name: 'Play Leg press demonstration' }).click();
  await page.getByRole('button', { name: 'Pause Leg press demonstration' }).waitFor();
  await page.clock.runFor(300);
  assert.notEqual(await artShape(), paused, 'play carries on');
  await page.getByRole('button', { name: 'Show how to do Leg press' }).click();
  await legArt.waitFor({ state: 'hidden' });
  const closed = await artShape();
  await page.clock.runFor(500);
  assert.equal(await artShape(), closed, 'closing stops the animation');
  await exercise(page, 'plank').getByRole('button', { name: 'Show how to do Plank' }).click();
  await exercise(page, 'plank').getByRole('img', { name: 'Plank: position to hold' }).waitFor({ state: 'visible' });
  await exercise(page, 'plank').getByRole('button', { name: 'Show how to do Plank' }).click();

  // External video and animated GIF links are present without making background requests.
  const legVideo = exercise(page, 'leg-press').getByRole('link', { name: 'Watch Leg press video' }).first();
  const legGif = exercise(page, 'leg-press').getByRole('link', { name: 'View Leg press animated GIF' }).first();
  assert.equal(await legVideo.getAttribute('target'), '_blank');
  assert.equal(await legVideo.getAttribute('rel'), 'noopener noreferrer');
  assert.match(await legVideo.getAttribute('href'), /^https:\/\/www\.youtube\.com\/results\?/);
  assert.equal(await legGif.getAttribute('target'), '_blank');
  assert.equal(await legGif.getAttribute('rel'), 'noopener noreferrer');
  assert.match(await legGif.getAttribute('href'), /^https:\/\/www\.google\.com\/search\?tbm=isch&tbs=itp:animated/);

  // Monday: a set needs a weight, then the rest timer runs.
  await prevDay(page);
  await prevDay(page);
  await page.getByRole('heading', { name: 'Monday, November 9' }).waitFor();
  await tick(page, 'leg-press', 0).click();
  await page.locator('#toast', { hasText: 'Enter the weight' }).waitFor();
  assert.equal(await tick(page, 'leg-press', 0).getAttribute('aria-pressed'), 'false');

  await weight(page, 'leg-press', 0).fill('60');
  assert.equal(await weight(page, 'leg-press', 1).inputValue(), '60', 'weight carries to the next set');
  await exercise(page, 'leg-press').locator('.set:not(.head)').nth(0).locator('input').nth(1).fill('12');
  await exercise(page, 'leg-press').locator('.set:not(.head)').nth(1).locator('input').nth(1).fill('12');
  await tick(page, 'leg-press', 0).click();
  await waitText(testId(page, 'set-count'), '1 of 12 sets');
  await waitText(testId(page, 'week-gym'), '1 of 3 visits');
  await page.locator('#rest').waitFor();
  await waitText(page.locator('#rest-label'), 'Rest · Leg press');
  await waitText(page.locator('#rest-time'), '1:30');
  await page.getByRole('button', { name: '15 seconds less' }).click();
  await waitText(page.locator('#rest-time'), '1:15');
  await page.clock.fastForward(76000);
  await page.locator('#rest').waitFor({ state: 'hidden' });

  await tick(page, 'leg-press', 1).click();
  await page.locator('#rest').waitFor();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.locator('#rest').waitFor({ state: 'hidden' });
  assert.ok(await exercise(page, 'leg-press').evaluate(e => e.classList.contains('complete')));

  // Plank can swap within Core stability (including rep-based moves like Dead bug) and swap back.
  await exercise(page, 'plank').getByRole('button', { name: 'Swap Plank' }).click();
  await exercise(page, 'plank').getByRole('button', { name: /Dead bug/ }).click();
  await waitText(exercise(page, 'plank').locator('h3'), 'Dead bug');
  await waitText(exercise(page, 'plank').locator('.target'), '2 × 8–10');
  assert.equal(await exercise(page, 'plank').locator('.set-timer').count(), 0, 'rep-based swap has no hold timer');
  await exercise(page, 'plank').getByRole('button', { name: 'Swap Dead bug' }).click();
  await exercise(page, 'plank').getByRole('button', { name: /Plank \(planned\)/ }).click();
  await waitText(exercise(page, 'plank').locator('h3'), 'Plank');

  // Plank has no weight, is saved in seconds, and offers an inline hold timer.
  await exercise(page, 'plank').getByRole('button', { name: 'Start timer for Plank set 1' }).click();
  await page.locator('#rest').waitFor();
  await waitText(page.locator('#rest-label'), 'Plank (set 1)');
  await waitText(page.locator('#rest-time'), '0:20');
  await page.getByRole('button', { name: 'Skip' }).click();
  await tick(page, 'plank', 0).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await waitText(testId(page, 'set-count'), '3 of 12 sets');

  // Machine taken: swap to an alternate, which starts with an empty weight.
  await exercise(page, 'seated-row').getByRole('button', { name: 'Swap Seated row' }).click();
  await exercise(page, 'seated-row').getByRole('button', { name: /Single-arm dumbbell row/ }).click();
  await waitText(exercise(page, 'seated-row').locator('h3'), 'Single-arm dumbbell row');
  assert.ok(await exercise(page, 'seated-row').getByText('Instead of Seated row').isVisible());
  assert.equal(await weight(page, 'seated-row', 0).inputValue(), '');
  await weight(page, 'seated-row', 0).fill('30');
  await tick(page, 'seated-row', 0).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await waitText(testId(page, 'set-count'), '4 of 12 sets');

  // Can't swap away with sets already ticked, so those numbers stay with the right movement.
  await exercise(page, 'seated-row').getByRole('button', { name: 'Swap Single-arm dumbbell row' }).click();
  await exercise(page, 'seated-row').getByRole('button', { name: /Seated row \(planned\)/ }).click();
  await page.locator('#toast', { hasText: 'Untick the sets' }).waitFor();
  await waitText(exercise(page, 'seated-row').locator('h3'), 'Single-arm dumbbell row');

  // A swap with nothing ticked goes back to the planned machine.
  await exercise(page, 'lat-pulldown').getByRole('button', { name: 'Swap Lat pulldown' }).click();
  await exercise(page, 'lat-pulldown').getByRole('button', { name: /Band pulldown/ }).click();
  await waitText(exercise(page, 'lat-pulldown').locator('h3'), 'Band pulldown');
  assert.equal(await exercise(page, 'lat-pulldown').locator('.set:not(.head)').first().locator('input').count(), 1, 'a band has no weight box');
  await exercise(page, 'lat-pulldown').getByRole('button', { name: 'Swap Band pulldown' }).click();
  await exercise(page, 'lat-pulldown').getByRole('button', { name: /Lat pulldown \(planned\)/ }).click();
  await waitText(exercise(page, 'lat-pulldown').locator('h3'), 'Lat pulldown');

  // Swapping with "Every workout" updates the default slot and supports Undo.
  await exercise(page, 'chest-press').getByRole('button', { name: 'Swap Chest press machine' }).click();
  await exercise(page, 'chest-press').getByRole('button', { name: 'Every workout' }).click();
  await exercise(page, 'chest-press').getByRole('button', { name: /Dumbbell bench press/ }).click();
  await waitText(exercise(page, 'db-bench').locator('h3'), 'Dumbbell bench press');
  await page.locator('#toast', { hasText: 'set for every workout' }).waitFor();
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitText(exercise(page, 'chest-press').locator('h3'), 'Chest press machine');

  // A third set: added, carrying the weight down, and counted.
  const setRows = id => exercise(page, id).locator('.set:not(.head)');
  assert.equal(await exercise(page, 'chest-press').getByRole('button', { name: /^Remove last set/ }).count(), 0, 'nothing extra to remove yet');
  await weight(page, 'chest-press', 0).fill('40');
  await exercise(page, 'chest-press').getByRole('button', { name: 'Add set to Chest press machine' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-exercise="chest-press"] .set:not(.head)').length === 3);
  assert.equal(await weight(page, 'chest-press', 2).inputValue(), '40');
  await waitText(testId(page, 'set-count'), '4 of 13 sets');
  for (const n of [0, 1, 2]) {
    await tick(page, 'chest-press', n).click();
    await page.getByRole('button', { name: 'Skip' }).click();
  }
  await waitText(testId(page, 'set-count'), '7 of 13 sets');
  assert.ok(await exercise(page, 'chest-press').evaluate(e => e.classList.contains('complete')));

  // Rating is offered only once every set is ticked, and answers straight away.
  const nextHint = exercise(page, 'chest-press').locator('[data-testid="next-time"]');
  assert.equal(await exercise(page, 'seated-row').locator('.effort').isVisible(), false);
  await exercise(page, 'chest-press').getByRole('button', { name: 'Chest press machine felt: Form slipped' }).click();
  await waitText(nextHint, 'Next time: Drop to 35 lb and keep every rep controlled.');
  await exercise(page, 'chest-press').getByRole('button', { name: 'Chest press machine felt: Good' }).click();
  await waitText(nextHint, 'Next time: Stay at 40 lb and aim for 11 reps.');
  assert.equal(await exercise(page, 'chest-press').locator('[data-effort="good"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await exercise(page, 'chest-press').locator('[data-effort="max"]').getAttribute('aria-pressed'), 'false');
  await exercise(page, 'chest-press').getByRole('button', { name: /^Remove last set/ }).click();
  await page.locator('#toast', { hasText: 'Untick the last set' }).waitFor();
  assert.equal(await setRows('chest-press').count(), 3, 'a ticked set is not removed');

  // An added set that isn't wanted can be taken away again.
  await exercise(page, 'seated-row').getByRole('button', { name: /^Add set to/ }).click();
  await waitText(testId(page, 'set-count'), '7 of 14 sets');
  await exercise(page, 'seated-row').getByRole('button', { name: /^Remove last set/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-exercise="seated-row"] .set:not(.head)').length === 2);
  await waitText(testId(page, 'set-count'), '7 of 13 sets');

  // Warm-up, Apple Watch reminder and a timed stretch.
  const pre = page.locator('[data-routine="gym-pre"]');
  const post = page.locator('[data-routine="gym-post"]');
  assert.ok(await pre.getByText('Choose Traditional Strength Training').isVisible());
  await pre.getByRole('checkbox', { name: 'Start Apple Watch workout' }).check();
  await waitText(testId(page, 'gym-pre-count'), '1 of 6');
  await post.getByRole('button', { name: /timer for Standing quad stretch/ }).click();
  await page.locator('#rest').waitFor();
  await waitText(page.locator('#rest-label'), 'Standing quad stretch');
  await waitText(page.locator('#rest-time'), '0:30');
  await page.getByRole('button', { name: 'Skip' }).click();
  for (const box of await post.getByRole('checkbox').all()) await box.check();
  await waitText(testId(page, 'gym-post-count'), '7 of 7');
  await page.waitForFunction(() => document.querySelector('[data-routine="gym-post"]')?.open === false);
  await post.locator('summary').click();

  // Saved across a reload.
  await page.reload();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  await prevDay(page);
  await prevDay(page);
  await waitText(testId(page, 'set-count'), '7 of 13 sets');
  assert.equal(await tick(page, 'leg-press', 0).getAttribute('aria-pressed'), 'true');
  assert.equal(await tick(page, 'chest-press', 2).getAttribute('aria-pressed'), 'true', 'the third set is saved');
  assert.equal(await exercise(page, 'chest-press').locator('[data-effort="good"]').getAttribute('aria-pressed'), 'true', 'the rating is saved');
  await waitText(exercise(page, 'seated-row').locator('h3'), 'Single-arm dumbbell row');
  await waitText(testId(page, 'gym-pre-count'), '1 of 6');
  await waitText(testId(page, 'gym-post-count'), '7 of 7');

  // Tuesday: cardio, with an impossible entry refused first.
  await nextDay(page);
  await page.getByRole('heading', { name: 'Tuesday, November 10' }).waitFor();
  const minutes = page.getByRole('spinbutton', { name: 'Minutes' });
  assert.equal(await minutes.inputValue(), '20');
  await page.getByRole('button', { name: '5 minutes more' }).click();
  await page.waitForFunction(() => document.querySelector('input[aria-label="Minutes"]')?.value === '25');
  assert.equal(await minutes.inputValue(), '25');
  await page.getByRole('spinbutton', { name: 'Average heart rate' }).fill('500');
  await page.getByRole('button', { name: 'Log cardio', exact: true }).click();
  await page.locator('#toast', { hasText: /heart rate/ }).waitFor();
  await page.getByRole('spinbutton', { name: 'Average heart rate' }).fill('112');
  await page.getByRole('button', { name: 'Log cardio', exact: true }).click();
  await page.getByText('25 min · 112 bpm').waitFor();
  await waitText(testId(page, 'week-cardio'), '25 of 150 min');

  // Remove and undo.
  await page.getByRole('button', { name: 'Remove Brisk walk' }).click();
  await waitText(testId(page, 'week-cardio'), '0 of 150 min');
  await page.getByRole('button', { name: 'Undo' }).click();
  await waitText(testId(page, 'week-cardio'), '25 of 150 min');

  // Adding a gym workout on a cardio day keeps one warm-up and one cool-down, and can be hidden again.
  await page.getByRole('button', { name: 'Add gym workout' }).click();
  await page.waitForFunction(() => document.querySelectorAll('details.routine').length === 2);
  await page.getByRole('button', { name: 'Hide gym workout' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 0);

  // Wednesday: last session's numbers are pre-filled, with a nudge at the top of the range.
  await nextDay(page);
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  assert.equal(await weight(page, 'leg-press', 0).inputValue(), '60');
  assert.ok(await exercise(page, 'leg-press').getByText('Last, Nov 9: 60 lb × 12, 60 lb × 12').isVisible());
  assert.ok(await exercise(page, 'leg-press').getByText('try a small increase').isVisible());
  await exercise(page, 'leg-press').getByRole('button', { name: 'Try 65 lb' }).click();
  await page.waitForFunction(() => document.querySelector('[data-exercise="leg-press"] .set:not(.head) input')?.value === '65');
  assert.equal(await weight(page, 'leg-press', 0).inputValue(), '65');
  assert.equal(await exercise(page, 'leg-press').locator('.set:not(.head)').nth(0).locator('input').nth(1).inputValue(), '10');
  await weight(page, 'leg-press', 0).fill('60');
  await exercise(page, 'leg-press').locator('.set:not(.head)').nth(0).locator('input').nth(1).fill('12');
  await exercise(page, 'leg-press').locator('.set:not(.head)').nth(1).locator('input').nth(1).fill('12');
  await waitText(exercise(page, 'chest-press').locator('[data-testid="suggestion"]'), 'Suggested: Stay at 40 lb and aim for 11 reps.');
  assert.equal(await setRows('chest-press').first().locator('input').nth(1).inputValue(), '11', 'the suggestion fills in the reps');
  assert.equal(await exercise(page, 'leg-press').locator('[data-testid="suggestion"]').count(), 0, 'no rating, no suggestion');
  assert.equal(await setRows('chest-press').count(), 3, 'three sets carry to the next session');
  assert.equal(await weight(page, 'chest-press', 2).inputValue(), '40');
  await waitText(testId(page, 'set-count'), '0 of 13 sets');
  await exercise(page, 'chest-press').getByRole('button', { name: /^Remove last set/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-exercise="chest-press"] .set:not(.head)').length === 2);
  await waitText(testId(page, 'set-count'), '0 of 12 sets');
  await waitText(exercise(page, 'seated-row').locator('h3'), 'Seated row');
  assert.equal(await weight(page, 'seated-row', 0).inputValue(), '', 'dumbbell weights do not pre-fill the machine');
  await page.screenshot({ path: path.join(OUT, 'today.png'), fullPage: true });

  // Remove an exercise for today only, and undo it.
  const cards = page.locator('.exercise');
  await exercise(page, 'plank').getByRole('button', { name: 'Remove Plank' }).click();
  await exercise(page, 'plank').getByRole('button', { name: 'Today only' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 5);
  await waitText(testId(page, 'set-count'), '0 of 10 sets');
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 6);
  await exercise(page, 'plank').getByRole('button', { name: 'Remove Plank' }).click();
  await exercise(page, 'plank').getByRole('button', { name: 'Today only' }).click();

  // Other days keep it, and a logged exercise can't be removed by accident.
  await prevDay(page);
  await prevDay(page);
  await page.getByRole('heading', { name: 'Monday, November 9' }).waitFor();
  assert.equal(await tick(page, 'plank', 0).getAttribute('aria-pressed'), 'true');
  await exercise(page, 'leg-press').getByRole('button', { name: 'Remove Leg press' }).click();
  await page.locator('#toast', { hasText: 'Untick this exercise' }).waitFor();
  assert.equal(await exercise(page, 'leg-press').getByRole('button', { name: 'Every workout' }).isVisible(), false);
  await page.getByRole('button', { name: 'Back to today →' }).click();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();

  // Remove from every workout, then add it back for today only.
  await exercise(page, 'lat-pulldown').getByRole('button', { name: 'Remove Lat pulldown' }).click();
  await exercise(page, 'lat-pulldown').getByRole('button', { name: 'Every workout' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 4);
  await waitText(testId(page, 'set-count'), '0 of 8 sets');
  const addPanel = async () => page.getByRole('button', { name: '+ Add exercise' }).click();
  await addPanel();
  await page.getByRole('combobox', { name: 'Add to' }).selectOption('today');
  await page.getByRole('combobox', { name: 'Exercise to add' }).selectOption('lat-pulldown');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 5);
  await waitText(testId(page, 'set-count'), '0 of 10 sets');

  // Create an exercise that joins every workout.
  await addPanel();
  await page.getByRole('button', { name: 'Create and add' }).click();
  await page.locator('#toast', { hasText: 'Enter a name' }).waitFor();
  await page.getByRole('textbox', { name: 'New exercise name' }).fill('leg press');
  await page.getByRole('button', { name: 'Create and add' }).click();
  await page.locator('#toast', { hasText: 'already exists' }).waitFor();
  await page.getByRole('textbox', { name: 'New exercise name' }).fill('Cable crunch');
  await page.getByRole('combobox', { name: 'New exercise type' }).selectOption('reps');
  await page.getByRole('button', { name: 'Create and add' }).click();
  const crunch = page.locator('.exercise', { hasText: 'Cable crunch' });
  await crunch.waitFor();
  assert.equal(await crunch.locator('.set:not(.head)').first().locator('input').count(), 1, 'reps only, no weight box');
  assert.equal(await crunch.locator('.art-thumb.art-placeholder').count(), 1, 'a created exercise gets a placeholder drawing');
  assert.equal(await cards.count(), 6);

  // A mistaken exercise can be deleted while it has no history.
  await addPanel();
  await page.getByRole('combobox', { name: 'Add to' }).selectOption('today');
  await page.getByRole('textbox', { name: 'New exercise name' }).fill('Temp move');
  await page.getByRole('button', { name: 'Create and add' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.exercise').length === 7);
  await nav(page, 'Data');
  await page.getByRole('button', { name: 'Delete Temp move' }).click();
  await nav(page, 'Today');
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  assert.equal(await cards.count(), 6);

  // All of that survives a reload.
  await page.reload();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  assert.equal(await cards.count(), 6);
  assert.equal(await exercise(page, 'plank').count(), 0);
  assert.equal(await crunch.count(), 1);

  // Text in a note is only ever text, and saves on input.
  const note = page.getByRole('textbox', { name: 'Note for this day' });
  await note.fill('<img src=x onerror="window.__xss=1">');
  await waitText(testId(page, 'note-status'), 'Saved');
  await note.blur();

  // Progress shows the same numbers.
  await nav(page, 'Progress');
  await waitText(testId(page, 'total-gym'), '1 of 36');
  await waitText(testId(page, 'total-cardio'), '25');
  assert.equal(await page.locator('.calendar .cell').count(), 84);
  assert.equal(await page.locator('.calendar [data-date="2026-11-09"]').getAttribute('data-s'), 'gym');
  assert.equal(await page.locator('.calendar [data-date="2026-11-10"]').getAttribute('data-s'), 'cardio');
  assert.ok(await page.locator('.calendar [data-date="2026-11-12"]').isDisabled());
  await page.locator('.bar-cardio').first().waitFor();
  assert.equal(await page.locator('.bar-cardio').count(), 1);
  await page.locator('.dot-gym').first().waitFor();
  await noOverflow(page, 'Progress');
  await page.screenshot({ path: path.join(OUT, 'progress.png'), fullPage: true });
  await page.getByRole('combobox', { name: 'Exercise' }).selectOption('seated-row');
  await page.getByText('Finish a set of seated row').waitFor();
  await page.getByRole('combobox', { name: 'Exercise' }).selectOption('db-row');
  await page.locator('.dot-gym').first().waitFor();

  await page.locator('.calendar [data-date="2026-11-10"]').click();
  await page.getByRole('heading', { name: 'Tuesday, November 10' }).waitFor();

  await nav(page, 'Plan');
  await page.getByRole('heading', { name: 'Weekly schedule' }).waitFor();
  await noOverflow(page, 'Plan');
  const planText = await page.locator('main').textContent();
  assert.ok(!/LDL|HDL|triglyceride/i.test(planText), 'lab results stay out of the app');
  assert.ok(!planText.includes('[object'), 'the Plan page shows real content');
  assert.ok(await page.getByRole('heading', { name: 'Leg press', level: 3 }).isVisible());
  assert.ok(await page.getByText('Goblet squat: Hold one dumbbell').isVisible());
  assert.ok(await page.getByRole('heading', { name: 'Shoulder press machine', level: 3 }).isVisible());
  assert.ok(await page.getByRole('heading', { name: 'Gym cool-down and stretch' }).isVisible());
  assert.ok(await page.getByText('Standing quad stretch: 30 sec each leg').first().isVisible());

  // Theme switcher, reminders, backup, erase, restore.
  await nav(page, 'Data');
  await noOverflow(page, 'Data');
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('corporate');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'corporate');
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('system');
  assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-theme')), null);

  assert.equal(await page.getByLabel('Reminder time').inputValue(), '16:00');
  await page.getByRole('checkbox', { name: 'Daily workout reminder' }).check();
  await page.getByLabel('Reminder time').fill('16:30');
  await page.getByRole('button', { name: 'Remind on Sunday' }).click();
  await page.waitForFunction(() => document.querySelector('button[aria-label="Remind on Sunday"]')?.getAttribute('aria-pressed') === 'true');
  assert.equal(await page.getByRole('button', { name: 'Remind on Sunday' }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Test reminder' }).click();
  await page.locator('#toast', { hasText: 'Gym day: Full-body machine workout' }).waitFor();
  const [icsDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Add to calendar (.ics)' }).click()]);
  assert.equal(icsDl.suggestedFilename(), 'workout-reminders.ics');
  const icsPath = path.join(OUT, icsDl.suggestedFilename());
  await icsDl.saveAs(icsPath);
  const icsText = fs.readFileSync(icsPath, 'utf8');
  assert.match(icsText, /DTSTART:20261109T163000/);
  assert.match(icsText, /SUMMARY:Gym day: Full-body machine workout/);

  await page.getByRole('combobox', { name: 'Smallest weight jump' }).selectOption('10');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download backup' }).click()]);
  assert.equal(dl.suggestedFilename(), 'workout-tracker-2026-11-11.json');
  const backupPath = path.join(OUT, dl.suggestedFilename());
  await dl.saveAs(backupPath);
  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  assert.equal(backup.days.length, 3);

  await page.getByRole('button', { name: 'Erase all data' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Erase' }).click();
  await page.getByRole('heading', { name: 'Start your 12 weeks' }).waitFor();

  await nav(page, 'Data');
  await page.locator('input[type=file]').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"nope"}') });
  await page.locator('#toast', { hasText: 'not a Workout Tracker backup' }).waitFor();

  await page.locator('input[type=file]').setInputFiles(backupPath);
  await page.locator('dialog').getByRole('button', { name: 'Replace' }).click();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  await waitText(testId(page, 'week-gym'), '1 of 3 visits');
  await waitText(testId(page, 'week-cardio'), '25 of 150 min');
  assert.equal(await page.getByRole('textbox', { name: 'Note for this day' }).inputValue(), '<img src=x onerror="window.__xss=1">');
  assert.equal(await page.evaluate(() => window.__xss), undefined);

  await nav(page, 'Data');
  assert.equal(await page.getByRole('combobox', { name: 'Smallest weight jump' }).inputValue(), '10', 'settings come back with a backup');
  assert.equal(await page.getByRole('checkbox', { name: 'Daily workout reminder' }).isChecked(), true);
  assert.equal(await page.getByLabel('Reminder time').inputValue(), '16:30');
  assert.equal(await page.getByRole('button', { name: 'Remind on Sunday' }).getAttribute('aria-pressed'), 'true');
  await nav(page, 'Today');
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();

  // The routine and created exercises come back with a backup, and can be logged.
  const restored = page.locator('.exercise', { hasText: 'Cable crunch' });
  assert.equal(await page.locator('.exercise').count(), 6);
  await restored.locator('.tick').first().click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await waitText(testId(page, 'set-count'), '1 of 12 sets');

  // Narrowest phones.
  await page.setViewportSize({ width: 320, height: 640 });
  await noOverflow(page, 'Today at 320px');
  await page.setViewportSize({ width: 390, height: 844 });

  // Angular Service Worker offline reload.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  await context.setOffline(false);

  // People who ask for less motion get still pictures.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await nav(page, 'Progress');
  await nav(page, 'Today');
  await page.getByRole('button', { name: 'Show how to do Leg press' }).click();
  await page.getByRole('img', { name: 'Leg press: start and finish positions' }).waitFor({ state: 'visible' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // Dark mode screenshot & installable manifest verification.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: path.join(OUT, 'today-dark.png'), fullPage: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(DIST_ROOT, icon.src)), `${icon.src} is missing from dist`);
  }

  // Legacy v1 IndexedDB Migration Test: simulate a user who keyed in data on v1-vanilla and now opens Angular v2.
  const v1Page = await context.newPage();
  await v1Page.clock.install({ time: WEDNESDAY });
  await v1Page.goto(URL);
  await v1Page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('workout-tracker', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('days')) db.createObjectStore('days', { keyPath: 'date' });
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['days', 'kv'], 'readwrite');
        const days = tx.objectStore('days');
        days.clear();
        days.put({
          date: '2026-11-09',
          gym: {
            sets: {
              'leg-press': [{ weight: 80, value: 12, done: true }, { weight: 80, value: 12, done: true }],
              'db-bench': [{ weight: 30, value: 12, done: true }],
              'custom-legacy1': [{ weight: 25, value: 12, done: true }],
            },
            effort: { 'leg-press': 'good' },
            swaps: { 'chest-press': 'db-bench' },
          },
          steps: { 'gp-watch': true },
          cardio: [{ id: 'c-v1', type: 'walk', minutes: 35, hr: 118, talk: true }],
          note: 'Pre-migration vanilla workout',
        });
        const kv = tx.objectStore('kv');
        kv.clear();
        kv.put({
          startDate: '2026-10-26',
          rest: 75,
          beep: false,
          step: 10,
          routine: ['leg-press', 'chest-press', 'custom-legacy1'],
          custom: [{ id: 'custom-legacy1', name: 'Cable curl', kind: 'weight' }],
          reminder: { enabled: true, time: '17:30', days: [1, 3, 5] },
        }, 'settings');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  });

  await v1Page.reload();
  await v1Page.getByRole('heading', { name: 'Today, Nov 11' }).waitFor();
  await v1Page.getByText('Week 3 of 12').waitFor({ state: 'visible' });
  assert.equal(await v1Page.locator('.exercise').count(), 3, 'v1 custom routine order preserved');
  await v1Page.locator('.exercise', { hasText: 'Cable curl' }).waitFor({ state: 'visible' });
  assert.equal(await v1Page.locator('[data-exercise="leg-press"] .set:not(.head)').first().locator('input').first().inputValue(), '90', 'v1 step=10 and week=3 suggestion computed from v1 logs');

  await v1Page.getByRole('button', { name: 'Previous day' }).click();
  await v1Page.getByRole('button', { name: 'Previous day' }).click();
  await v1Page.getByRole('heading', { name: 'Monday, November 9' }).waitFor();
  assert.equal(await v1Page.getByRole('textbox', { name: 'Note for this day' }).inputValue(), 'Pre-migration vanilla workout');
  await v1Page.locator('.exercise', { hasText: 'Dumbbell bench press' }).getByText('Instead of Chest press machine').waitFor({ state: 'visible' });
  await v1Page.getByText('35 min · 118 bpm · talk test passed').waitFor({ state: 'visible' });

  await v1Page.locator('nav button', { hasText: 'Data' }).click();
  await v1Page.getByLabel('Smallest weight jump').waitFor({ state: 'visible' });
  assert.equal(await v1Page.getByLabel('Smallest weight jump').inputValue(), '10');
  assert.equal(await v1Page.getByLabel('Rest between sets').inputValue(), '75');
  assert.equal(await v1Page.getByLabel('Reminder time').inputValue(), '17:30');
  await v1Page.getByText('Cable curl').waitFor({ state: 'visible' });

  assert.deepEqual(errors, [], 'page errors');
  assert.deepEqual(external, [], 'requests to other sites');
  await browser.close();
  server.close();
  console.log('Browser test + v1 data migration check passed.');
})().catch(e => { console.error(e); process.exit(1); });
