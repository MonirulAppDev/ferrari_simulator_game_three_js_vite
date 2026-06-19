const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  
  // Click on the center of the page to focus the canvas
  await page.mouse.click(500, 500);
  await page.waitForTimeout(1000);
  
  // Press W for 3 seconds
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  
  // Capture screenshot while moving
  await page.screenshot({ path: 'test_car_moving.png' });
  
  await page.keyboard.up('w');
  
  await browser.close();
})();
