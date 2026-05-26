// client/tests/e2e.spec.ts
import { test, expect } from '@playwright/test'

test.describe('AI Study Focus SaaS MVP E2E Suite', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the main dev/production application endpoint
    await page.goto('/')
  })

  test('1. Onboarding & Authentication Flow', async ({ page }) => {
    // Verify landing page elements are visible
    await expect(page.locator('h1')).toContainText('Study Focus')
    
    // Fill credentials and click register/login
    await page.fill('input[placeholder*="Username"]', 'scholar_test')
    await page.fill('input[placeholder*="Email"]', 'scholar_test@antigravity.edu')
    await page.fill('input[placeholder*="Password"]', 'AcademicPassword123!')
    
    // Submit registration
    await page.click('button:has-text("Register")')

    // Expect successful authorization and landing on dashboard
    await expect(page.locator('h2')).toContainText('scholar_test')
    await expect(page.locator('.premium-label')).toContainText('FREE MEMBER')
  })

  test('2. Pomodoro Accountability Timer & Synchronization', async ({ page }) => {
    // Auto-login or simulate session
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'mock-valid-jwt-token')
    })
    await page.reload()

    // Switch to Study Corridors tab
    await page.click('button:has-text("Corridors")')
    await expect(page.locator('h2')).toContainText('Enter a Study Corridor')

    // Launch a new Focus corridor
    await page.fill('input[placeholder="Room Name"]', 'E2E Focus lounge')
    await page.fill('input[placeholder="Focus description..."]', 'Analyzing Playwright code')
    await page.click('button:has-text("Create Room")')

    // Verify room entered successfully
    await expect(page.locator('h2')).toContainText('E2E Focus lounge')
    await expect(page.locator('.timer-display')).toContainText('25:00')

    // Trigger Pomodoro Timer Start Focus
    await page.click('button:has-text("Start Focus")')

    // Verify status switches to Active
    await expect(page.locator('.premium-label.pro-label')).toContainText('POMODORO')
  })

  test('3. Monetization Gateway Pro Billing Locks', async ({ page }) => {
    // Auto-login Free user
    await page.evaluate(() => {
      localStorage.setItem('accessToken', 'mock-valid-jwt-token')
    })
    await page.reload()

    // Select Study Corridors tab
    await page.click('button:has-text("Corridors")')

    // Enter a room
    await page.click('.room-sidebar-item:first-child')

    // Verify AI companion locks out free tier
    await expect(page.locator('.locked-state-overlay')).toBeVisible()
    await expect(page.locator('.locked-content h3')).toContainText('Companion is Premium')

    // Click Upgrade to Pro
    await page.click('button:has-text("Upgrade to Pro")')

    // Verify Pricing card overlay is visible
    await expect(page.locator('.upgrade-modal')).toBeVisible()
    await expect(page.locator('.premium-plan h3')).toContainText('Cognitive Elite Pro')

    // Trigger stripe mock checkout
    await page.click('button:has-text("Upgrade to Pro via Stripe")')

    // Verify entitlement upgrades immediately
    await expect(page.locator('.upgrade-modal')).not.toBeVisible()
    await expect(page.locator('.premium-label')).toContainText('PRO ELITE')
  })

  test('4. Grid Columns Collapse under Mobile Viewports', async ({ page }) => {
    // Configure mobile width viewport
    await page.setViewportSize({ width: 375, height: 812 })
    
    // Go to rooms layout
    await page.click('button:has-text("Corridors")')

    // Verify grid layout falls back to single column list
    const gridLayout = page.locator('.room-container-grid')
    await expect(gridLayout).toHaveCSS('grid-template-columns', '1fr')
  })
})
