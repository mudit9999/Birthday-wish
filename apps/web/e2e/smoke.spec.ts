import { expect, test, type Page } from '@playwright/test'
import { E2E_ENV } from './env'

const DAY_MS = 24 * 60 * 60 * 1000
// The app's default `time_zone` setting; India has no DST, so "now + 24h" is always tomorrow there.
const TIME_ZONE = 'Asia/Kolkata'
const BIRTH_YEAR = '1958'

function tomorrowInAppZone(): { day: string; month: string } {
  // en-CA formats as YYYY-MM-DD; the form's option values are unpadded numbers.
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date(Date.now() + DAY_MS))
  const [, month, day] = iso.split('-').map(Number)
  return { day: String(day), month: String(month) }
}

async function signInAsAdmin(page: Page): Promise<void> {
  await page.goto('/login/admin')
  await page.getByLabel('Password').fill(E2E_ENV.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL('/admin')
}

async function addMember(page: Page): Promise<void> {
  await page.goto('/admin/members')
  await page.getByLabel('Name').fill('Test Member')
  await page.getByLabel('Mobile number').fill('9999900001')
  await page.getByRole('button', { name: 'Add member' }).click()
  await expect(page.getByRole('status')).toHaveText(/^Added\./)
  await page.reload()
  await expect(page.getByText('+919999900001')).toBeVisible()
}

async function addTomorrowsBirthday(page: Page): Promise<void> {
  const { day, month } = tomorrowInAppZone()
  await page.goto('/entries/new')
  await page.getByRole('radio', { name: 'Birthday' }).check()
  await page.getByLabel('Name', { exact: true }).fill('Test Member')
  await page.locator('select[name="day"]').selectOption(day)
  await page.locator('select[name="month"]').selectOption(month)
  await page.getByLabel('Year').fill(BIRTH_YEAR)
  await page.getByRole('button', { name: 'Save entry' }).click()
  await expect(page).toHaveURL('/entries')
}

test('admin signs in, adds a member and a birthday, checks settings and signs out', async ({ page }) => {
  await signInAsAdmin(page)
  await addMember(page)
  await addTomorrowsBirthday(page)

  await page.goto('/')
  const row = page.getByRole('listitem').filter({ hasText: 'Test Member' })
  await expect(row).toContainText('Birthday')
  await expect(row).toContainText('Tomorrow')
  await expect(page.locator('body')).not.toContainText(BIRTH_YEAR)

  await page.goto('/admin/settings')
  await page.getByLabel('Wishes posted').fill('25:00')
  await page.getByRole('button', { name: 'Save settings' }).click()
  await expect(page.getByText('Use 24-hour HH:MM, e.g. 20:00')).toBeVisible()
  await expect(page.getByText('Saved.', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL('/login')
  await page.goto('/admin')
  await expect(page).toHaveURL('/login')
})
