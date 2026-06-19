const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173');
  
  console.log('Clicking START ENGINE');
  await page.click('button:has-text("START ENGINE")');
  await page.waitForTimeout(500);

  console.log('Accelerating for 5 seconds...');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(5000);

  console.log('Turning right for 2 seconds while holding W...');
  await page.keyboard.down('d');
  
  for(let i=0; i<10; i++) {
    await page.waitForTimeout(200);
    const speed = await page.evaluate(() => document.getElementById('hud-speed').innerText);
    console.log('Speed: ' + speed + ' km/h');
  }
  
  await page.keyboard.up('d');
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: 'test_turn_result.png' });
  await browser.close();
})();
