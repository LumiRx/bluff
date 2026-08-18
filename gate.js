/* Every harness walks through the front door the way a player does.

   With cash off, the door is one checkbox: agree to the house rules. The
   age-and-region version is still in the game behind the CASH flag and comes
   back with the prizes, so this helper handles both and the suites do not have
   to care which one they are looking at. */
module.exports = async function passGate(p, opts) {
  opts = opts || {};
  await p.waitForSelector('#tos', { timeout: 8000 });
  const gated = await p.locator('#age18').count();
  if (gated) {
    if (opts.under18 !== true) await p.check('#age18');
    const country = opts.country || 'US';
    await p.selectOption('#ctry', country);
    if (country === 'US') await p.selectOption('#st', opts.state || 'NY');
  }
  await p.check('#tos');
  await p.click('#gGo');
  await p.waitForSelector('#hnd', { timeout: 8000 });
};
