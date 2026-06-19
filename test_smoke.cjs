const { chromium } = require('playwright');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  console.log('Navigating to game...');
  await page.goto('http://localhost:5173');
  
  console.log('Waiting for Start Engine button...');
  await page.click('text=START ENGINE', { timeout: 10000 });
  
  // Wait a bit for physics to settle
  await page.waitForTimeout(2000);
  
  console.log('Holding W and Space to simulate burnout...');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down(' ');
  
  // Wait for 3 seconds of burnout
  await page.waitForTimeout(3000);
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'test_smoke_result.png' });
  
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up(' ');
  
  console.log('Done!');
  await browser.close();
})();
